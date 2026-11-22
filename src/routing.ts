// Make worker inline so it works from esm.sh / AnyWidget without external asset fetches or CORS issues.
import RoutingWorker from "./routing.worker?worker&inline";
import type {
  ClassBox,
  OuterEdgeInput,
  RoutePoint,
  RouteWorkerRequest,
  RouteWorkerResponse,
} from "./routing.worker";

export type { ClassBox, OuterEdgeInput, RoutePoint };

// Reuse a single warm worker when not aborted so WASM only compiles once per session;
// terminate and recreate on abort so long routing jobs cancel immediately.
let sharedWorker: Worker | null = null;
let workerBusy = false;

function acquireWorker(): Worker {
  if (sharedWorker && !workerBusy) {
    return sharedWorker;
  }
  return new RoutingWorker();
}

export function routeOuterEdgesWithCancel(
  classes: ClassBox[],
  edges: OuterEdgeInput[],
  mergeEdges: boolean,
  signal: AbortSignal
): Promise<Map<string, RoutePoint[]>> {
  if (edges.length === 0 || classes.length === 0) {
    return Promise.resolve(new Map());
  }

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const worker = acquireWorker();
    const isShared = worker === sharedWorker || sharedWorker === null;
    if (sharedWorker === null) {
      sharedWorker = worker;
    }
    if (isShared) {
      workerBusy = true;
    }

    let settled = false;
    const cleanup = (terminate: boolean) => {
      worker.onmessage = null;
      worker.onerror = null;
      signal.removeEventListener("abort", onAbort);
      if (terminate) {
        worker.terminate();
        if (worker === sharedWorker) {
          sharedWorker = null;
          workerBusy = false;
        }
      } else if (isShared) {
        workerBusy = false;
      } else {
        worker.terminate();
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(signal.reason);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<RouteWorkerResponse>) => {
      if (settled) return;
      settled = true;
      cleanup(false);
      if (event.data.ok) {
        resolve(new Map(event.data.routes));
      } else {
        reject(new Error(event.data.error));
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(err instanceof ErrorEvent ? err.error ?? new Error(err.message) : err);
    };

    const req: RouteWorkerRequest = { classes, edges, mergeEdges };
    worker.postMessage(req);
  });
}
