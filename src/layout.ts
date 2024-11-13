import { scheme } from "vega-scale";
import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

import { Node, Edge } from "@xyflow/react";
// Make worker inline because if its external cannot be loaded from esm.sh due to CORS
import ELKWorker from "elkjs/lib/elk-worker?worker&inline";
import { EGraph, EGraphClassID, EGraphNodeID, EGraphNode, inlineProperties } from "./serializedEGraph";

// Elk has a *huge* amount of options to configure. To see everything you can
// tweak check out:
//
// - https://www.eclipse.org/elk/reference/algorithms.html
// - https://www.eclipse.org/elk/reference/options.html

const rootLayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  // This seems to result in a more compact layout
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.mergeEdges": "true",

  // Can you use spline routing instead which generates non orthogonal edges
  // "elk.edgeRouting": "SPLINES",
  // "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE",
};

// the number of pixels of padding between nodes and between nodes and their parents
const nodePadding = 5;

const classLayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.componentComponent": nodePadding.toString(),
  "elk.spacing.nodeNode": nodePadding.toString(),
  "elk.padding": `[top=${nodePadding},left=${nodePadding},bottom=${nodePadding},right=${nodePadding}]`,
  "elk.spacing.portPort": "0",
  // allow ports on e-class to be anywhere
  // TODO: they only seem to appear on top side of nodes, figure out if there is a way to allow them
  // to be on all sides if it would result in a better layout
  portConstraints: "FREE",
};

// https://github.com/eclipse/elk/issues/1037#issuecomment-2122136560
const interactiveOptions = {
  "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
  "elk.layered.layering.strategy": "INTERACTIVE",
  "elk.layered.nodePlacement.strategy": "INTERACTIVE",
  // Had to disable or leads to weird edges
  // "elk.layered.crossingMinimization.semiInteractive": "true",
  // "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
};

const nodeLayoutOptions = {
  portConstraints: "FIXED_ORDER",
};

type Color = string;
// Use these color schemes for the nodes
// https://vega.github.io/vega/docs/schemes/#categorical
const colorScheme: Color[] = [...scheme("pastel1"), ...scheme("pastel2")];

export type FlowClass = Node<
  {
    color: string | null;
    id: string;
    // selected?: boolean
  },
  "class"
>;
export type FlowNode = Node<
  {
    label: string;
    id: string;
    subsumed?: boolean;
    hidden: boolean;
    // selected?: boolean
  },
  "node"
>;
export type FlowEdge = Edge<{ points: { x: number; y: number }[] }, "edge">;

type MyELKEdge = ElkExtendedEdge & { sourceNode: string; targetNode: string; edgeID: string };
/// ELK Node but with additional data added to be later used when converting to react flow nodes
type MyELKNode = Omit<ElkNode, "children" | "edges"> & {
  edges: MyELKEdge[];
  children: ({
    data: FlowClass["data"];
    // Edges from e-node to it's own class must be in sub-graph
    edges: MyELKEdge[];
    children: ({
      width: number;
      height: number;
      data: FlowNode["data"];
    } & ElkNode)[];
  } & Omit<ElkNode, "children" | "position" | "edges">)[];
};

/// ELK node but with layout information added
type MyELKNodeLayedOut = Omit<MyELKNode, "children"> & {
  children: (Omit<MyELKNode["children"][0], "children"> & {
    x: number;
    y: number;
    width: number;
    height: number;
    children: (Omit<MyELKNode["children"][0]["children"][0], "children"> & {
      x: number;
      y: number;
    })[];
  })[];
};

// Mapping of class to color, where undefined class mapps to null
type Colors = Map<string | undefined, string | null>;

export type PreviousLayout = { layout: MyELKNodeLayedOut; colors: Colors };
export type SelectedNode = { type: "class" | "node"; id: string };

/**
 * Transform a JSON egraph into the laid out nodes.
 *
 * Also emits the ELK JSON before layout for debugging, and the internal layout details so that it can use the previous one if needed
 */
export async function layoutGraph(
  egraph: string,
  getNodeSize: (contents: string) => { width: number; height: number },
  aspectRatio: number,
  selectedNode: SelectedNode | null,
  previousLayout: PreviousLayout | null,
  mergeEdges: boolean,
  signal: AbortSignal,
  // mapping of node id to whether the node is hidden or not
  // We will also by default hide some nodes to improve rendering to start.
  hiddenOverrides: Record<EGraphNodeID, boolean>,
  initialMaxNodes: number
): Promise<{
  nodes: (FlowNode | FlowClass)[];
  edges: FlowEdge[];
  edgeToNodes: Map<string, string[]>;
  nodeToEdges: Map<string, string[]>;
  elkJSON: string;
  layout: PreviousLayout;
  hiddenNodeStats: { visible: number; total: number };
}> {
  const parsedEGraph: EGraph = JSON.parse(egraph);
  // inlineProperties(parsedEGraph);
  // printEGraphStats(parsedEGraph);
  console.time("toELKNode");
  const { elkNode, colors, hiddenNodeStats } = toELKNode(
    parsedEGraph,
    getNodeSize,
    selectedNode,
    aspectRatio,
    previousLayout,
    mergeEdges,
    hiddenOverrides,
    initialMaxNodes
  );
  const elkJSON = JSON.stringify(elkNode, null, 2);
  const layout = (await layoutWithCancel(elkNode, signal)) as MyELKNodeLayedOut;
  const edges = toFlowEdges(layout);
  const nodes = toFlowNodes(layout);
  const nodeToEdges = new Map(
    [...Object.entries(Object.groupBy(edges, (edge) => edge.source)), ...Object.entries(Object.groupBy(edges, (edge) => edge.target))].map(
      ([nodeID, edges]) => [nodeID, (edges || []).map((edge) => edge.id)]
    )
  );
  const edgeToNodes = new Map(edges.map((edge) => [edge.id, [edge.source, edge.target]]));
  return {
    layout: { layout, colors },
    elkJSON,
    nodes,
    edges,
    edgeToNodes,
    nodeToEdges,
    hiddenNodeStats,
  };
}

function computeHiddenNodes(
  egraph: EGraph,
  hiddenOverrides: Record<EGraphNodeID, boolean>,
  classToNodes: Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>,
  nodeToClass: Map<EGraphNodeID, EGraphClassID>,
  initialMaxNodes: number
): Set<EGraphNodeID> {
  // Since we can only expand children,
  // we have to start with showing all parents of the graph and then hide their nodes until we reach the limit
  // Ideally we we would like to show all parents, then show the descdents breadth first of the parent with the most
  // descendants until we reach the limit
  // We also have to account for cycles in the graph
  // 1. Create condensation graph
  // 2. traverse condensation graph and find SCCs without parents
  // 3. Choose a node from each of those SCCs
  // 4. BFS from those nodes until we reach the limit, then track rest of node as hidden
  // 5. Update hidden nodes with overrides

  // Build adjacency list representation of the graph
  const adjacencyList = new Map<EGraphNodeID, EGraphNodeID[]>();
  for (const [nodeID, node] of Object.entries(egraph.nodes)) {
    // all children of nodes includes all direct children and all nodes in those e-classes
    const allChildren = (node.children || []).flatMap((child) => classToNodes.get(nodeToClass.get(child)!)!.map(([id]) => id));
    adjacencyList.set(nodeID, allChildren);
  }

  // Compute SCCs using Tarjan's algorithm
  const { sccs, nodeToSCC } = computeSCCs(adjacencyList);

  // compute all the parent SCCs per SCC
  const sccToParents = new Array(sccs.length).fill(0).map(() => new Set<number>());
  // TODO: Verify that its topological?
  for (const [scc, nodes] of sccs.entries()) {
    for (const child of nodes.flatMap((node) => adjacencyList.get(node)!)) {
      const childScc = nodeToSCC.get(child)!;
      sccToParents[childScc].add(scc);
    }
  }
  // for (const [nodeID, childrenNodes] of adjacencyList.entries()) {
  //   const scc = nodeToSCC.get(nodeID)!;

  // }

  // Compute the height of every scc
  const sccHieght = new Array(sccs.length).fill(1);
  // Iterate in order, since sccs is in reverse topoligical order
  for (const [scc, parents] of sccToParents.entries()) {
    const parentHeight = sccHieght[scc] + 1;
    for (const parent of parents) {
      sccHieght[parent] = Math.max(sccHieght[parent], parentHeight);
    }
  }
  const tallestScc = sccHieght.indexOf(Math.max(...sccHieght));

  // Visit starting at the tallest SCC

  // Start with the node that has the highest height.
  const toVisitNodes = [sccs[tallestScc][0]];
  // const toVisitNodes = [...sccs.entries()].filter(([sccID]) => !nonRootSCCs.has(sccID)).map(([, [firstNode]]) => firstNode);
  // also include all other nodes that are in the same e-class as these root nodes first
  // for (const nodeID of [...toVisitNodes]) {
  //   const classID = nodeToClass.get(nodeID)!;
  //   const classNodes = classToNodes.get(classID)!;
  //   for (const [id] of classNodes) {
  //     if (id !== nodeID) {
  //       toVisitNodes.push(id);
  //     }
  //   }
  // }
  const visitedNodes = new Set<EGraphNodeID>();
  const hiddenNodes = new Set<EGraphNodeID>(adjacencyList.keys());
  // perform BFS and when we have visited at least initialMaxNodes, mark the rest as hidden
  while (toVisitNodes.length > 0) {
    const nodeID = toVisitNodes.shift()!;
    if (visitedNodes.has(nodeID)) continue;
    visitedNodes.add(nodeID);

    if (visitedNodes.size < initialMaxNodes) {
      hiddenNodes.delete(nodeID);
    }
    const neighbors = adjacencyList.get(nodeID)!;
    toVisitNodes.push(...neighbors);
  }

  // Apply hidden overrides
  for (const [nodeID, hidden] of Object.entries(hiddenOverrides)) {
    if (hidden) {
      hiddenNodes.add(nodeID);
    } else {
      hiddenNodes.delete(nodeID);
    }
  }
  return hiddenNodes;
}

// Helper function to compute SCCs using Tarjan's algorithm
function computeSCCs(adjacencyList: Map<EGraphNodeID, EGraphNodeID[]>): {
  sccs: EGraphNodeID[][];
  nodeToSCC: Map<EGraphNodeID, number>;
} {
  let index = 0;
  const indices = new Map<EGraphNodeID, number>();
  const lowlinks = new Map<EGraphNodeID, number>();
  const stack: EGraphNodeID[] = [];
  const onStack = new Set<EGraphNodeID>();
  const sccs: EGraphNodeID[][] = [];
  const nodeToSCC = new Map<EGraphNodeID, number>();

  const strongConnect = (nodeID: EGraphNodeID) => {
    indices.set(nodeID, index);
    lowlinks.set(nodeID, index);
    index++;
    stack.push(nodeID);
    onStack.add(nodeID);

    for (const neighbor of adjacencyList.get(nodeID) || []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlinks.set(nodeID, Math.min(lowlinks.get(nodeID)!, lowlinks.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowlinks.set(nodeID, Math.min(lowlinks.get(nodeID)!, indices.get(neighbor)!));
      }
    }

    if (lowlinks.get(nodeID) === indices.get(nodeID)) {
      const scc: EGraphNodeID[] = [];
      let w: EGraphNodeID;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        nodeToSCC.set(w, sccs.length);
      } while (w !== nodeID);
      sccs.push(scc);
    }
  };

  for (const nodeID of adjacencyList.keys()) {
    if (!indices.has(nodeID)) {
      strongConnect(nodeID);
    }
  }

  return { sccs, nodeToSCC };
}

// We wil convert this to a graph where the id of the nodes are class-{class_id} and node-{node_id}
// the ID of the edges will be edge-{source_id}-{port-index} and the ports will be port-{source_id}-{port-index}
function toELKNode(
  egraph: EGraph,
  getNodeSize: (contents: string) => { width: number; height: number },
  selectedNode: SelectedNode | null,
  aspectRatio: number,
  previousLayout: PreviousLayout | null,
  mergeEdges: boolean,
  hiddenOverrides: Record<EGraphNodeID, boolean>,
  initialMaxNodes: number
): { elkNode: MyELKNode; colors: Colors; hiddenNodeStats: { visible: number; total: number } } {
  const nodeToClass = new Map<EGraphNodeID, EGraphClassID>();
  const classToNodes = new Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>();
  for (const [id, node] of Object.entries(egraph.nodes)) {
    nodeToClass.set(id, node.eclass);
    if (!classToNodes.has(node.eclass)) {
      classToNodes.set(node.eclass, []);
    }
    classToNodes.get(node.eclass)!.push([id, node]);
  }

  let hiddenNodes;
  /// filter out to descendants of the selected node
  if (selectedNode) {
    hiddenNodes = new Set<string>();
    const toTraverse = new Set<string>();
    if (selectedNode.type === "class") {
      toTraverse.add(selectedNode.id);
    } else {
      const classID = nodeToClass.get(selectedNode.id)!;
      toTraverse.add(classID);
      // if we have selected a node, change the e-class to only include the selected node
      classToNodes.set(classID, [[selectedNode.id, egraph.nodes[selectedNode.id]]]);
    }
    const traversed = new Set<string>();
    while (toTraverse.size > 0) {
      const current: string = toTraverse.values().next().value!;
      toTraverse.delete(current);
      traversed.add(current);
      if (traversed.size > initialMaxNodes || hiddenOverrides[current] === true) {
        hiddenNodes.add(current);
      }
      for (const childNode of classToNodes.get(current)!.flatMap(([, node]) => node.children || [])) {
        const childClass = egraph.nodes[childNode].eclass;
        if (!traversed.has(childClass)) {
          toTraverse.add(childClass);
        }
      }
    }
    for (const id of classToNodes.keys()) {
      if (!traversed.has(id)) {
        classToNodes.delete(id);
      }
    }
  } else {
    hiddenNodes = computeHiddenNodes(egraph, hiddenOverrides, classToNodes, nodeToClass, initialMaxNodes);
  }

  const incomingEdges = new Map<EGraphClassID, { nodeID: string; index: number }[]>();
  const hiddenNodeStats = { visible: 0, total: 0 };
  // use classToNodes instead of egraph.nodes since it's already filtered and we dont want to create
  // export ports for nodes that are not in the graph
  for (const [nodeID, node] of [...classToNodes.values()].flatMap((nodes) => nodes)) {
    hiddenNodeStats.total++;
    // hidden nodes don't show out edges
    if (hiddenNodes.has(nodeID)) {
      continue;
    }
    hiddenNodeStats.visible++;
    for (const [index, child] of (node.children || []).entries()) {
      const childClass = nodeToClass.get(child)!;
      if (!incomingEdges.has(childClass)) {
        incomingEdges.set(childClass, []);
      }
      incomingEdges.get(childClass)!.push({ nodeID, index });
    }
  }

  // filter out any classes that have all hidden nodes and no incoming edges
  for (const [classID, nodes] of classToNodes.entries()) {
    if (nodes.every(([id]) => hiddenNodes.has(id)) && !incomingEdges.has(classID)) {
      classToNodes.delete(classID);
    }
  }

  const class_data = egraph.class_data || {};
  // Sort types so that the colors are consistent
  const sortedTypes = [
    ...new Set(
      Object.values(class_data)
        .map(({ type }) => type)
        .filter((type) => type)
    ),
  ].sort();
  const availableColors = [...colorScheme];
  const colors = new Map([[undefined, null]]) as Map<string | undefined, string | null>;
  // Start colors with those in previous layout if found
  if (previousLayout) {
    for (const [type, color] of previousLayout.colors.entries()) {
      if (sortedTypes.includes(type) && color) {
        colors.set(type, color);
        // remove from available colors
        availableColors.splice(availableColors.indexOf(color), 1);
        sortedTypes.splice(sortedTypes.indexOf(type), 1);
      }
    }
  }
  for (const [index, type] of sortedTypes.entries()) {
    colors.set(type, availableColors[index % availableColors.length]);
  }

  const elkRoot: MyELKNode = {
    id: "--eclipse-layout-kernel-root",
    layoutOptions: rootLayoutOptions,
    children: [],
    edges: [],
  };
  // aspectRatio must be number for it to work
  elkRoot.layoutOptions!["elk.aspectRatio"] = aspectRatio as unknown as string;
  for (const [classID, nodes] of classToNodes.entries()) {
    const elkClassID = `class-${classID}`;
    const elkClass: MyELKNode["children"][0] = {
      id: elkClassID,
      data: { color: colors.get(class_data[classID]?.type)!, id: classID },
      layoutOptions: classLayoutOptions,
      children: [],
      ports: mergeEdges
        ? []
        : (incomingEdges.get(classID) || []).map(({ nodeID, index }) => ({
            id: `port-class-incoming-${nodeID}-${index}`,
          })),

      edges: [],
    };
    elkRoot.children.push(elkClass);
    // every e-class can include at most one hidden rendered nodes. Any additional are skipped
    let addedHiddenNode = false;
    for (const [nodeID, node] of nodes) {
      const hidden = hiddenNodes.has(nodeID);
      let label = node.op;
      if (hidden) {
        if (addedHiddenNode) {
          continue;
        }
        addedHiddenNode = true;
        label = "?";
      }
      const size = getNodeSize(label);
      const elkNodeID = `node-${nodeID}`;
      const elkNode: MyELKNode["children"][0]["children"][0] = {
        id: elkNodeID,
        data: { label: label, id: nodeID, ...(node.subsumed ? { subsumed: true } : {}), hidden },
        width: size.width,
        height: size.height,
        ports: [],
        labels: [{ text: label }],
        layoutOptions: nodeLayoutOptions,
      };
      elkClass.children.push(elkNode);
      if (hidden) {
        // don't add child edges
        continue;
      }
      const nPorts = Object.keys(node.children || []).length;
      for (const [index, child] of (node.children || []).entries()) {
        const edgeID = `${nodeID}-${index}`;

        // In order to get the layout we want, we don't set `"elk.hierarchyHandling": "INCLUDE_CHILDREN"`
        // and instead have seperate layouts per e-class and globally. This means we need to make sure no edges
        // exit an e-node without going through a port on the e-class.

        // Two edges are created
        /// [edge-inner]: [port-node] ---> [port-class-outgoing] on this class
        /// [edge-outer]: [port-class-outgoing] on this class ---> [port-class-incoming] on target class

        // IDs for ports and edges are the [name]-[node ID]-[output index]
        // The [port-class-incoming] are already added, so we just need to add two edges and the other two ports

        // see https://github.com/eclipse/elk/issues/1068 for more details

        const elkTargetClassID = `class-${nodeToClass.get(child)!}`;
        const elkNodePortID = `port-node-${edgeID}`;
        const elkClassIncomingPortID = `port-class-incoming-${edgeID}`;
        const elkClassOutgoingPortID = `port-class-outgoing-${edgeID}`;
        const elkInnerEdgeID = `edge-inner-${edgeID}`;
        const elkOuterEdgeID = `edge-outer-${edgeID}`;

        elkNode.ports!.push({
          id: elkNodePortID,
          layoutOptions: {
            "port.side": "SOUTH",
            /// index is clockwise from top right, so we need to the reverse index, so that first port is on the left
            "port.index": (nPorts - index - 1).toString(),
          },
        });
        elkClass.ports!.push({ id: elkClassOutgoingPortID });
        elkClass.edges!.push({
          id: elkInnerEdgeID,
          edgeID,
          sourceNode: elkNodeID,
          targetNode: elkTargetClassID,
          sources: [elkNodePortID],
          targets: [elkClassOutgoingPortID],
        });
        elkRoot.edges!.push({
          id: elkOuterEdgeID,
          edgeID,
          sourceNode: elkNodeID,
          targetNode: elkTargetClassID,
          sources: [elkClassOutgoingPortID],
          targets: [mergeEdges ? elkTargetClassID : elkClassIncomingPortID],
        });
      }
    }
  }
  if (previousLayout) {
    const layout = previousLayout.layout;
    const previousLayoutClassIDs = new Set(layout.children.map(({ data }) => data.id));
    const overlappingClasses = Object.groupBy(
      elkRoot.children,
      ({ data }) => previousLayoutClassIDs.has(data.id).toString() as "true" | "false"
    );
    // Use interactive layout if more than half the classes already have positions as a heuristic
    if ((overlappingClasses.false || []).length > (overlappingClasses.true || []).length) {
      return { elkNode: elkRoot, colors, hiddenNodeStats };
    }
    // We have some children that were already layed out. So let's update all layout options to be interactive
    // and preserve the positions of the nodes that were already layed out
    elkRoot.layoutOptions = { ...elkRoot.layoutOptions, ...interactiveOptions };
    for (const elkClass of elkRoot.children) {
      const previousClass = layout.children.find(({ id }) => id === elkClass.id);
      if (!previousClass) {
        continue;
      }
      elkClass.layoutOptions = { ...elkClass.layoutOptions, ...interactiveOptions };
      elkClass.x = previousClass.x;
      elkClass.y = previousClass.y;
      for (const elkCLassPort of elkClass.ports || []) {
        const previousPort = (previousClass.ports || []).find(({ id }) => id === elkCLassPort.id);
        if (!previousPort) {
          continue;
        }
        elkCLassPort.x = previousPort.x;
        elkCLassPort.y = previousPort.y;
      }

      for (const elkNode of elkClass.children) {
        const previousNode = previousClass.children.find(({ id }) => id === elkNode.id);
        if (!previousNode) {
          continue;
        }
        for (const elkNodePort of elkNode.ports || []) {
          const previousPort = (previousNode.ports || []).find(({ id }) => id === elkNodePort.id);
          if (!previousPort) {
            continue;
          }
          elkNodePort.x = previousPort.x;
          elkNodePort.y = previousPort.y;
        }

        elkNode.x = previousNode.x;
        elkNode.y = previousNode.y;
      }
    }
  }

  return { elkNode: elkRoot, colors, hiddenNodeStats };
}

/**
 * Run an ELK layout that terminates if the signal is aborted.
 *
 * https://github.com/kieler/elkjs/issues/208#issuecomment-2407847314
 */
function layoutWithCancel(graph: ElkNode, signal: AbortSignal): Promise<ElkNode> {
  return new Promise((resolve, reject) => {
    // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal#implementing_an_abortable_api
    if (signal.aborted) {
      reject(signal.reason);
    }
    const elk = new ELK({
      workerFactory: () => new ELKWorker(),
      workerUrl: "",
    });
    signal.addEventListener("abort", () => {
      elk.terminateWorker();
      reject(signal.reason);
    });
    elk.layout(graph).then(resolve, reject);
  });
}

// This function takes an EGraph and returns an ELK node that can be used to layout the graph.
function toFlowNodes(layout: MyELKNodeLayedOut): (FlowClass | FlowNode)[] {
  return layout.children.flatMap(({ children, x, y, data, id: parentId, height, width }) => [
    { position: { x, y }, data, id: parentId, type: "class" as const, height, width },
    ...children!.map(({ x, y, height, width, data, id }) => ({
      data,
      id,
      type: "node" as const,
      parentId,
      position: { x, y },
      width,
      height,
    })),
  ]);
}

function toFlowEdges(layout: MyELKNodeLayedOut): FlowEdge[] {
  const outerEdges = Object.fromEntries(layout.edges!.map(({ edgeID, sections }) => [edgeID, sections![0]]));
  return layout.children.flatMap(({ x: parentX, y: parentY, edges }) =>
    edges!.map(({ edgeID, sections, sourceNode, targetNode }) => {
      const [section] = sections!;
      const outerEdge = outerEdges[edgeID];
      // Add container start to edge so that this is correct for edges nested in parents which are needed for self edges
      const innerPoints = [section.startPoint, ...(section.bendPoints || []), section.endPoint].map(({ x, y }) => ({
        x: x + parentX,
        y: y + parentY,
      }));
      return {
        type: "edge",
        id: edgeID,
        source: sourceNode,
        target: targetNode!,
        data: {
          // Combien inner and outer edge show it just shows up once in the rendering and can be selected as a single unit.
          points: [...innerPoints, ...(outerEdge.bendPoints || []), outerEdge.endPoint],
        },
      };
    })
  );
}
