import { AvoidLib } from "libavoid-js";
import libavoidWasmUrl from "virtual:libavoid-wasm";

export type RoutePoint = { x: number; y: number };

export type ClassBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OuterEdgeInput = {
  edgeID: string;
  sourceClassID: string;
  targetClassID: string;
  sourcePoint: RoutePoint;
  elkTargetPoint: RoutePoint;
};

export type RouteWorkerRequest = {
  classes: ClassBox[];
  edges: OuterEdgeInput[];
  mergeEdges: boolean;
};

export type RouteWorkerResponse =
  | { ok: true; routes: [string, RoutePoint[]][] }
  | { ok: false; error: string };

let avoidReady: Promise<ReturnType<typeof AvoidLib.getInstance>> | null = null;

function getAvoid() {
  if (!avoidReady) {
    avoidReady = AvoidLib.load(libavoidWasmUrl).then(() => AvoidLib.getInstance());
  }
  return avoidReady;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function simplifyPoints(pts: RoutePoint[]): RoutePoint[] {
  if (pts.length <= 2) return pts;
  const deduped: RoutePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 0.25) {
      deduped.push(pts[i]);
    }
  }
  if (deduped.length <= 2) return deduped;
  const out: RoutePoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = out[out.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 0.5) {
      out.push(b);
    }
  }
  out.push(deduped[deduped.length - 1]);
  return out;
}

function sideDirection(pt: RoutePoint, box: ClassBox, Avoid: ReturnType<typeof AvoidLib.getInstance>): number {
  const dTop = Math.abs(pt.y - box.y);
  const dBottom = Math.abs(pt.y - (box.y + box.height));
  const dLeft = Math.abs(pt.x - box.x);
  const dRight = Math.abs(pt.x - (box.x + box.width));
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  if (minD === dBottom) return Avoid.ConnDirDown;
  if (minD === dTop) return Avoid.ConnDirUp;
  if (minD === dLeft) return Avoid.ConnDirLeft;
  return Avoid.ConnDirRight;
}

function snapToBoxSide(
  pt: RoutePoint,
  box: ClassBox,
  dir: number,
  Avoid: ReturnType<typeof AvoidLib.getInstance>
): { xOff: number; yOff: number } {
  const xOff = box.width > 0 ? clamp((pt.x - box.x) / box.width, 0.01, 0.99) : 0.5;
  const yOff = box.height > 0 ? clamp((pt.y - box.y) / box.height, 0.01, 0.99) : 0.5;
  if (dir === Avoid.ConnDirDown) return { xOff, yOff: 1 };
  if (dir === Avoid.ConnDirUp) return { xOff, yOff: 0 };
  if (dir === Avoid.ConnDirLeft) return { xOff: 0, yOff };
  return { xOff: 1, yOff };
}

function routeWithAvoid(
  Avoid: ReturnType<typeof AvoidLib.getInstance>,
  req: RouteWorkerRequest
): [string, RoutePoint[]][] {
  const { classes, edges, mergeEdges } = req;
  if (edges.length === 0 || classes.length === 0) {
    return [];
  }

  // Crossing-penalty rerouting scales super-linearly with edge count; enable it up
  // to 180 edges (takes ~2ms-4s in WASM) and fall back to fast orthogonal avoidance
  // (~30-150ms) for giant graphs.
  const useCrossingPenalty = edges.length <= 180;
  // Unifying nudging preprocessing improves symmetry on smaller graphs but is O(N^3)
  // on dense graphs (>90 edges).
  const useUnifyingNudging = edges.length <= 90;

  const router = new Avoid.Router(Avoid.OrthogonalRouting);
  try {
    router.setRoutingParameter(Avoid.shapeBufferDistance, 4);
    router.setRoutingParameter(Avoid.idealNudgingDistance, 4);
    router.setRoutingParameter(Avoid.segmentPenalty, 25);
    router.setRoutingParameter(Avoid.reverseDirectionPenalty, 50);
    if (useCrossingPenalty) {
      router.setRoutingParameter(Avoid.crossingPenalty, 200);
    }

    router.setRoutingOption(Avoid.nudgeOrthogonalSegmentsConnectedToShapes, true);
    router.setRoutingOption(Avoid.nudgeSharedPathsWithCommonEndPoint, true);
    router.setRoutingOption(Avoid.performUnifyingNudgingPreprocessingStep, useUnifyingNudging);
    router.setRoutingOption(Avoid.penaliseOrthogonalSharedPathsAtConnEnds, !mergeEdges);

    const classById = new Map<string, ClassBox>();
    const shapeById = new Map<string, InstanceType<typeof Avoid.ShapeRef>>();
    for (const c of classes) {
      classById.set(c.id, c);
      const rect = new Avoid.Rectangle(
        new Avoid.Point(c.x, c.y),
        new Avoid.Point(c.x + c.width, c.y + c.height)
      );
      shapeById.set(c.id, new Avoid.ShapeRef(router, rect));
    }

    const classesWithBottomOutgoing = new Set<string>();
    const incomingCounts = new Map<string, number>();
    for (const e of edges) {
      incomingCounts.set(e.targetClassID, (incomingCounts.get(e.targetClassID) ?? 0) + 1);
      const srcBox = classById.get(e.sourceClassID);
      if (srcBox && sideDirection(e.sourcePoint, srcBox, Avoid) === Avoid.ConnDirDown) {
        classesWithBottomOutgoing.add(e.sourceClassID);
      }
    }

    // Attach target pins on all free sides (preferring top, then left/right, then bottom
    // if the class has no outgoing ports on the bottom). Libavoid's nudging fans multiple
    // connectors cleanly across each side.
    const TARGET_PIN_CLASS = 1;
    for (const c of classes) {
      if ((incomingCounts.get(c.id) ?? 0) === 0) continue;
      const shape = shapeById.get(c.id)!;
      const sides: [number, number, number, number][] = [
        [0.5, 0, Avoid.ConnDirUp, 0],
        [0, 0.5, Avoid.ConnDirLeft, 15],
        [1, 0.5, Avoid.ConnDirRight, 15],
      ];
      if (!classesWithBottomOutgoing.has(c.id)) {
        sides.push([0.5, 1, Avoid.ConnDirDown, 25]);
      }
      for (const [xOff, yOff, dir, cost] of sides) {
        const pin = new Avoid.ShapeConnectionPin(shape, TARGET_PIN_CLASS, xOff, yOff, true, 0, dir);
        pin.setExclusive(false);
        if (cost > 0) {
          pin.setConnectionCost(cost);
        }
      }
    }

    // Route shorter edges first so local edges keep direct paths and long edges route around them.
    const sortedEdges = [...edges].sort((a, b) => {
      const da = Math.abs(a.elkTargetPoint.x - a.sourcePoint.x) + Math.abs(a.elkTargetPoint.y - a.sourcePoint.y);
      const db = Math.abs(b.elkTargetPoint.x - b.sourcePoint.x) + Math.abs(b.elkTargetPoint.y - b.sourcePoint.y);
      return da - db;
    });

    let nextPinClassId = 2;
    const connByEdgeId = new Map<string, InstanceType<typeof Avoid.ConnRef>>();
    for (const e of sortedEdges) {
      const srcBox = classById.get(e.sourceClassID);
      const srcShape = shapeById.get(e.sourceClassID);
      const tgtShape = shapeById.get(e.targetClassID);
      if (!srcBox || !srcShape || !tgtShape) continue;

      const srcDir = sideDirection(e.sourcePoint, srcBox, Avoid);
      const srcSnap = snapToBoxSide(e.sourcePoint, srcBox, srcDir, Avoid);
      const srcPinClass = nextPinClassId++;
      const srcPin = new Avoid.ShapeConnectionPin(
        srcShape,
        srcPinClass,
        srcSnap.xOff,
        srcSnap.yOff,
        true,
        0,
        srcDir
      );
      srcPin.setExclusive(false);

      const srcEnd = new Avoid.ConnEnd(srcShape, srcPinClass);
      const tgtEnd = new Avoid.ConnEnd(tgtShape, TARGET_PIN_CLASS);
      const conn = new Avoid.ConnRef(router, srcEnd, tgtEnd);
      conn.setRoutingType(Avoid.ConnType_Orthogonal);
      if (useCrossingPenalty) {
        conn.setHateCrossings(true);
      }
      connByEdgeId.set(e.edgeID, conn);
    }

    router.processTransaction();

    const routes: [string, RoutePoint[]][] = [];
    for (const [edgeID, conn] of connByEdgeId.entries()) {
      const poly = conn.displayRoute();
      if (poly && poly.size() >= 2) {
        const pts: RoutePoint[] = [];
        for (let i = 0; i < poly.size(); i++) {
          const p = poly.get_ps(i);
          pts.push({ x: p.x, y: p.y });
        }
        const simplified = simplifyPoints(pts);
        if (simplified.length >= 2) {
          routes.push([edgeID, simplified]);
        }
      }
    }
    return routes;
  } finally {
    Avoid.destroy(router);
  }
}

self.onmessage = async (event: MessageEvent<RouteWorkerRequest>) => {
  try {
    const Avoid = await getAvoid();
    const routes = routeWithAvoid(Avoid, event.data);
    const resp: RouteWorkerResponse = { ok: true, routes };
    self.postMessage(resp);
  } catch (err) {
    const resp: RouteWorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(resp);
  }
};
