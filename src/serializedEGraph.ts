
export type EGraphNodeID = string;
export type EGraphClassID = string;
export type EGraphNode = {
  op: string;
  children?: EGraphNodeID[];
  eclass: EGraphClassID;
  cost: number;
  subsumed?: boolean;
};

export type EGraphClassData = {
  type?: string;
  properties?: { [key: string]: string };
};
export type EGraph = {
  nodes: { [id: EGraphNodeID]: EGraphNode };
  root_eclasses?: EGraphClassID[];
  class_data?: { [id: EGraphClassID]: EGraphClassData };
  properties?: { [key: string]: string };
};


export function inlineProperties(egraph: EGraph) {
  // find all e-classes that have two nodes and no incoming edges, and one of the nodes
  // has only one child. Remove those two nodes and instead add this as a property to the e-class.
  // So like if:
  // 1. eq-class-1: {x, y}
  // 2. parents(eq-class-1): {}
  // 2. children(x): {eq-class-2}
  // 3. children(y): {}
  // Then:
  // 1. Remove eq-class-1, including, x and y,
  // 2. Add set property(eq-class-2, opname(x), opname(y))

  // Map from class ID to nodes in that class
  const classToNodes = new Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>();
  for (const [nodeID, node] of Object.entries(egraph.nodes)) {
    if (!classToNodes.has(node.eclass)) {
      classToNodes.set(node.eclass, [[nodeID, node]]);
    } else {
      classToNodes.get(node.eclass)!.push([nodeID, node]);
    }
  }

  // Create a set of all class IDs which have incoming edges
  const hasIncomingEdges = new Set<EGraphClassID>();
  for (const node of Object.values(egraph.nodes)) {
    for (const child of node.children || []) {
      hasIncomingEdges.add(egraph.nodes[child].eclass);
    }
  }

  // Set of nodes to remove
  const nodesToRemove = new Set<EGraphNodeID>();
  const eclassToRemove = new Set<EGraphClassID>();

  for (const [classID, nodes] of classToNodes.entries()) {
    if (hasIncomingEdges.has(classID)) {
      continue;
    }
    if (nodes.length !== 2) {
      continue;
    }
    const nodesByNChildren = Object.groupBy(nodes, ([, node]) => (node.children || []).length);
    // if both have no children, add to global properties
    if (nodesByNChildren[0]?.length == 2) {
      const {
        0: [[xID, { op: xOp }], [yID, { op: yOp }]],
      } = nodesByNChildren;
      nodesToRemove.add(xID);
      nodesToRemove.add(yID);
      eclassToRemove.add(classID);
      if (!egraph.properties) {
        egraph.properties = {};
      }
      egraph.properties[xOp] = yOp;
      continue;
    }
    if (nodesByNChildren[0]?.length !== 1 || nodesByNChildren[1]?.length !== 1) {
      continue;
    }
    const {
      0: [[yID, { op: yOp }]],
      1: [[xID, { op: xOp, children: xChildren }]],
    } = nodesByNChildren;
    nodesToRemove.add(xID);
    nodesToRemove.add(yID);
    eclassToRemove.add(classID);
    const [xChild] = xChildren!;
    const xChildEClass = egraph.nodes[xChild].eclass;

    // Add properties to the e-class
    if (!egraph.class_data) {
      egraph.class_data = {};
    }
    if (!egraph.class_data[xChildEClass]) {
      egraph.class_data[xChildEClass] = {};
    }
    if (!egraph.class_data[xChildEClass].properties) {
      egraph.class_data[xChildEClass].properties = {};
    }
    egraph.class_data[xChildEClass].properties[xOp] = yOp;
  }

  // Remove nodes and classes
  for (const nodeID of nodesToRemove) {
    delete egraph.nodes[nodeID];
  }
  if (egraph.class_data) {
    for (const classID of eclassToRemove) {
      delete egraph.class_data[classID];
    }
  }
}

/**
 * Print some stats about the egraph to the console, to help with understanding how large it is.
 */
export function printEGraphStats(egraph: EGraph) {
  const nNodes = Object.keys(egraph.nodes).length;
  const nClasses = new Set(Object.values(egraph.nodes).map((node) => node.eclass)).size;
  console.log(`EGraph with ${nNodes} nodes and ${nClasses} classes`);

  // create distribution of how many nodes per class
  const classToNodes = new Map<EGraphClassID, number>();
  for (const node of Object.values(egraph.nodes)) {
    const count = classToNodes.get(node.eclass) || 0;
    classToNodes.set(node.eclass, count + 1);
  }

  // print out the distribution
  const counts = [...classToNodes.values()].sort((a, b) => a - b);
  const min = counts[0];
  const max = counts[counts.length - 1];
  const median = counts[Math.floor(counts.length / 2)];
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`Nodes per class: min=${min}, max=${max}, median=${median}, total=${total}`);

  /// print out top 10 classes with most nodes, along with their type
  const topClasses = [...classToNodes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([classID, count]) => {
      const type = egraph.class_data?.[classID]?.type;
      return { classID, count, type };
    });
  console.log("Top classes with most nodes");
  console.table(topClasses);

  /// print out the number of classes per type, sorted by count
  const typeToClasses = new Map<string, number>();
  for (const node of Object.values(egraph.nodes)) {
    const type = egraph.class_data?.[node.eclass]?.type;
    if (!type) {
      continue;
    }
    const count = typeToClasses.get(type) || 0;
    typeToClasses.set(type, count + 1);
  }
  const typeCounts = [...typeToClasses.entries()].sort((a, b) => b[1] - a[1]);
  console.log("Classes per type");
  console.table(typeCounts);

  // print out the number of disconnected e-graphs and the top number of nodes

  /// 1 create a mapping from each e-class to all of it's neighbors, forward or backward
  const neighbors = new Map<EGraphClassID, Set<EGraphClassID>>();
  for (const node of Object.values(egraph.nodes)) {
    const eclass = node.eclass;
    if (!neighbors.has(eclass)) {
      neighbors.set(eclass, new Set());
    }
    for (const child of node.children || []) {
      neighbors.get(eclass)!.add(egraph.nodes[child].eclass);
      // add backward edge
      if (!neighbors.has(egraph.nodes[child].eclass)) {
        neighbors.set(egraph.nodes[child].eclass, new Set());
      }
      neighbors.get(egraph.nodes[child].eclass)!.add(eclass);
    }
  }
  /// 2. find all connected components, by making a mapping from each e-class to it's canonical class
  const classToCanonical = new Map<EGraphClassID, EGraphClassID>();
  const nClassesPerCanonical = new Map<EGraphClassID, number>();

  function markCanonical(eclass: EGraphClassID, canonical: EGraphClassID) {
    classToCanonical.set(eclass, canonical);
    const count = nClassesPerCanonical.get(canonical) || 0;
    nClassesPerCanonical.set(canonical, count + 1);
    for (const neighbor of neighbors.get(eclass)!) {
      if (classToCanonical.has(neighbor)) {
        continue;
      }
      markCanonical(neighbor, canonical);
    }
  }
  for (const eclass of neighbors.keys()) {
    if (classToCanonical.has(eclass)) {
      continue;
    }
    markCanonical(eclass, eclass);
  }

  /// 3 Print out the number of connected components
  const table = [...nClassesPerCanonical.entries()].sort((a, b) => b[1] - a[1]);
  console.log("Classes per component");
  console.table(table);

  /// Find all strongly connected components of graph and print number of them. Use Kosaraju's algorithm
  const sccs = findStronglyConnectedComponents(egraph);
  console.log(`Number of strongly connected components: ${sccs.length}`);

  // Build SCC graph
  const sccIndexMap = new Map<EGraphClassID, number>();
  sccs.forEach((scc, index) => {
    for (const eclass of scc) {
      sccIndexMap.set(eclass, index);
    }
  });

  const sccAdjList = new Map<number, Set<number>>();
  for (const [eclass, neighbors] of buildAdjacencyList(egraph).entries()) {
    const fromScc = sccIndexMap.get(eclass)!;
    for (const neighbor of neighbors) {
      const toScc = sccIndexMap.get(neighbor)!;
      if (fromScc !== toScc) {
        if (!sccAdjList.has(fromScc)) {
          sccAdjList.set(fromScc, new Set());
        }
        sccAdjList.get(fromScc)!.add(toScc);
      }
    }
  }

  // Identify root SCCs (no incoming edges)
  const sccIncomingEdges = new Map<number, number>();
  for (const neighbors of sccAdjList.values()) {
    for (const toScc of neighbors) {
      sccIncomingEdges.set(toScc, (sccIncomingEdges.get(toScc) || 0) + 1);
    }
  }

  const rootSCCs = [];
  for (let i = 0; i < sccs.length; i++) {
    if (!sccIncomingEdges.has(i)) {
      rootSCCs.push(i);
    }
  }

  const rootsAndSizes = [];
  // Compute descendants for each root SCC
  for (const rootScc of rootSCCs) {
    const visited = new Set<number>();
    const stack = [rootScc];
    while (stack.length > 0) {
      const sccIndex = stack.pop()!;
      for (const neighbor of sccAdjList.get(sccIndex) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    rootsAndSizes.push(visited.size);
  }
  console.log("# of root SCCs and their sizes", rootsAndSizes.length);
  console.log("max", Math.max(...rootsAndSizes));
}

function buildAdjacencyList(egraph: EGraph): Map<EGraphClassID, Set<EGraphClassID>> {
  const adjList = new Map<EGraphClassID, Set<EGraphClassID>>();
  for (const node of Object.values(egraph.nodes)) {
    const eclass = node.eclass;
    if (!adjList.has(eclass)) {
      adjList.set(eclass, new Set());
    }
    for (const childID of node.children || []) {
      const childClassID = egraph.nodes[childID].eclass;
      adjList.get(eclass)!.add(childClassID);
    }
  }
  return adjList;
}

function findStronglyConnectedComponents(egraph: EGraph): EGraphClassID[][] {
  // Build the adjacency list (directed graph)
  const adjList = new Map<EGraphClassID, EGraphClassID[]>();
  for (const node of Object.values(egraph.nodes)) {
    const eclass = node.eclass;
    if (!adjList.has(eclass)) {
      adjList.set(eclass, []);
    }
    for (const childID of node.children || []) {
      const childClassID = egraph.nodes[childID].eclass;
      adjList.get(eclass)!.push(childClassID);
    }
  }

  // First pass: DFS to compute finishing times
  const visited = new Set<EGraphClassID>();
  const stack: EGraphClassID[] = [];
  for (const eclass of adjList.keys()) {
    if (!visited.has(eclass)) {
      dfsFirstPass(eclass, adjList, visited, stack);
    }
  }

  // Transpose the graph
  const transposedAdjList = new Map<EGraphClassID, EGraphClassID[]>();
  for (const [eclass, neighbors] of adjList.entries()) {
    for (const neighbor of neighbors) {
      if (!transposedAdjList.has(neighbor)) {
        transposedAdjList.set(neighbor, []);
      }
      transposedAdjList.get(neighbor)!.push(eclass);
    }
  }

  // Second pass: DFS on transposed graph to find SCCs
  visited.clear();
  const sccs: EGraphClassID[][] = [];
  while (stack.length > 0) {
    const eclass = stack.pop()!;
    if (!visited.has(eclass)) {
      const component: EGraphClassID[] = [];
      dfsSecondPass(eclass, transposedAdjList, visited, component);
      sccs.push(component);
    }
  }

  return sccs;
}

function dfsFirstPass(
  eclass: EGraphClassID,
  adjList: Map<EGraphClassID, EGraphClassID[]>,
  visited: Set<EGraphClassID>,
  stack: EGraphClassID[]
) {
  visited.add(eclass);
  for (const neighbor of adjList.get(eclass) || []) {
    if (!visited.has(neighbor)) {
      dfsFirstPass(neighbor, adjList, visited, stack);
    }
  }
  stack.push(eclass);
}

function dfsSecondPass(
  eclass: EGraphClassID,
  adjList: Map<EGraphClassID, EGraphClassID[]>,
  visited: Set<EGraphClassID>,
  component: EGraphClassID[]
) {
  visited.add(eclass);
  component.push(eclass);
  for (const neighbor of adjList.get(eclass) || []) {
    if (!visited.has(neighbor)) {
      dfsSecondPass(neighbor, adjList, visited, component);
    }
  }
}
