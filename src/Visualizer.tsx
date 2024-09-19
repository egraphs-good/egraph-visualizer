/// <reference types="react/canary" />

import "@xyflow/react/dist/style.css";
import { CodeBracketIcon } from "@heroicons/react/24/outline";

import { scheme } from "vega-scale";
import { ErrorBoundary } from "react-error-boundary";
import type { EdgeChange, EdgeProps, EdgeTypes, NodeChange, NodeProps } from "@xyflow/react";

import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import ELKWorkerURL from "elkjs/lib/elk-worker?url";

import { createContext, memo, startTransition, Suspense, use, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  NodeTypes,
  MarkerType,
  Edge,
  useNodesInitialized,
  useReactFlow,
  BaseEdge,
  Handle,
  Position,
  Controls,
  Panel,
  NodeToolbar,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

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

const nodeLayoutOptions = {
  portConstraints: "FIXED_ORDER",
};

const elk = new ELK({
  workerUrl: ELKWorkerURL,
});
type EGraphNodeID = string;
type EGraphClassID = string;
type EGraphNode = {
  op: string;
  children?: EGraphNodeID[];
  eclass: EGraphClassID;
  cost: number;
};

type EGraphClassData = {
  type?: string;
};
type EGraph = {
  nodes: { [id: EGraphNodeID]: EGraphNode };
  root_eclasses?: EGraphClassID[];
  class_data?: { [id: EGraphClassID]: EGraphClassData };
};

type Color = string;
// Use these color schemes for the nodes
// https://vega.github.io/vega/docs/schemes/#categorical
const colorScheme: Color[] = [...scheme("pastel1"), ...scheme("pastel2")];

type FlowClass = Node<
  {
    color: string | null;
    id: string;
    // selected?: boolean
  },
  "class"
>;
type FlowNode = Node<
  {
    label: string;
    id: string;
    // selected?: boolean
  },
  "node"
>;
type FlowEdge = Edge<{ points: { x: number; y: number }[] }, "edge">;

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

// We wil convert this to a graph where the id of the nodes are class-{class_id} and node-{node_id}
// the ID of the edges will be edge-{source_id}-{port-index} and the ports will be port-{source_id}-{port-index}
function toELKNode(
  egraph: EGraph,
  outerElem: HTMLDivElement,
  innerElem: HTMLDivElement,
  selectedNode: { type: "class" | "node"; id: string } | null,
  aspectRatio: number
): MyELKNode {
  const nodeToClass = new Map<EGraphNodeID, EGraphClassID>();
  const classToNodes = new Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>();
  for (const [id, node] of Object.entries(egraph.nodes)) {
    nodeToClass.set(id, node.eclass);
    if (!classToNodes.has(node.eclass)) {
      classToNodes.set(node.eclass, []);
    }
    classToNodes.get(node.eclass)!.push([id, node]);
  }
  /// filter out to descendants of the selected node
  if (selectedNode) {
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
  }

  const incomingEdges = new Map<EGraphClassID, { nodeID: string; index: number }[]>();
  // use classToNodes instead of egraph.nodes since it's already filtered and we dont want to create
  // export ports for nodes that are not in the graph
  for (const [nodeID, node] of [...classToNodes.values()].flatMap((nodes) => nodes)) {
    for (const [index, child] of (node.children || []).entries()) {
      const childClass = nodeToClass.get(child)!;
      if (!incomingEdges.has(childClass)) {
        incomingEdges.set(childClass, []);
      }
      incomingEdges.get(childClass)!.push({ nodeID, index });
    }
  }

  const class_data = egraph.class_data || {};
  // Sort types so that the colors are consistent
  const sortedTypes = Object.values(class_data)
    .map(({ type }) => type)
    .filter((type) => type)
    .sort();
  const typeToColor = sortedTypes.reduce((acc, type, index) => {
    acc.set(type, colorScheme[index % colorScheme.length]);
    return acc;
  }, new Map([[undefined, null]]) as Map<string | undefined, string | null>);

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
      data: { color: typeToColor.get(class_data[classID]?.type)!, id: classID },
      layoutOptions: classLayoutOptions,
      children: [],
      ports: (incomingEdges.get(classID) || []).map(({ nodeID, index }) => ({
        id: `port-class-incoming-${nodeID}-${index}`,
      })),

      edges: [],
    };
    elkRoot.children.push(elkClass);
    for (const [nodeID, node] of nodes) {
      innerElem.innerText = node.op;
      const size = outerElem.getBoundingClientRect();
      const elkNodeID = `node-${nodeID}`;
      const elkNode: MyELKNode["children"][0]["children"][0] = {
        id: elkNodeID,
        data: { label: node.op, id: nodeID },
        width: size.width,
        height: size.height,
        ports: [],
        labels: [{ text: node.op }],
        layoutOptions: nodeLayoutOptions,
      };
      elkClass.children.push(elkNode);
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
          targets: [elkClassIncomingPortID],
        });
      }
    }
  }

  return elkRoot;
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

export function EClassNode({ data, selected }: NodeProps<FlowClass>) {
  return (
    <div
      className={`rounded-md border-dotted border-black h-full w-full ${selected ? "border-2" : "border"}`}
      style={{ backgroundColor: data.color! || "white" }}
      title={data.id}
    >
      <MyNodeToolbar type="class" id={data.id} />
      <Handle type="target" position={Position.Top} className="invisible" />
      <Handle type="source" position={Position.Bottom} className="invisible" />
    </div>
  );
}

export function ENode(
  props: Partial<
    NodeProps<FlowNode> & {
      outerRef: React.Ref<HTMLDivElement>;
      innerRef: React.Ref<HTMLDivElement>;
    }
  >
) {
  return (
    <div
      className={`p-1 rounded-md outline bg-white outline-black h-full w-full ${props?.selected ? "outline-2" : "outline-1"}`}
      ref={props?.outerRef}
    >
      {props?.outerRef ? <></> : <MyNodeToolbar type="node" id={props!.data!.id} />}

      <div
        className="font-mono text-xs truncate max-w-96 min-w-4 text-center"
        title={`${props?.data?.id}\n${props?.data?.label}`}
        ref={props?.innerRef}
      >
        {props?.data?.label}
      </div>
      {/* Only show handle if we aren't rendering this to calculate size */}
      {props?.outerRef ? <></> : <Handle type="source" position={Position.Bottom} className="invisible" />}
    </div>
  );
}

export function MyNodeToolbar(node: { type: "class" | "node"; id: string }) {
  const selectNode = useContext(SetSelectedNodeContext);
  const onClick = useCallback(() => selectNode!(node), [selectNode, node]);
  return (
    <NodeToolbar position={Position.Top}>
      <button
        onClick={onClick}
        className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Filter
      </button>
    </NodeToolbar>
  );
}

export function CustomEdge({ data, ...rest }: EdgeProps<FlowEdge>) {
  const { points } = data!;
  const edgePath = points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return <BaseEdge {...rest} path={edgePath} style={{ stroke: "black", strokeWidth: rest.selected ? 1 : 0.5 }} />;
}

const nodeTypes: NodeTypes = {
  class: memo(EClassNode),
  node: memo(ENode),
};

const edgeTypes: EdgeTypes = {
  edge: memo(CustomEdge),
};

// Context to store a callback to set the node so it can be accessed from the node component
// without having to pass it manually
const SetSelectedNodeContext = createContext<null | ((node: { type: "class" | "node"; id: string } | null) => void)>(null);

// function nodeColor(node: FlowClass | FlowNode): string {
//   return node.type === "class" ? node.data.color! : "white";
// }

/// Processes changes for selection, returning a new set if any of the changes are selection changes and they change the set of selections
function processSelectionChanges(
  changes: (NodeChange<FlowNode | FlowClass> | EdgeChange<FlowEdge>)[],
  currentlySelected: Set<string>
): Set<string> | null {
  let newSelected = null;
  for (const change of changes) {
    if (change.type !== "select") {
      continue;
    }
    const isSelectedNow = currentlySelected.has(change.id);
    if (change.selected) {
      if (!isSelectedNow) {
        if (!newSelected) {
          newSelected = new Set(currentlySelected);
        }
        newSelected.add(change.id);
      }
    } else {
      if (isSelectedNow) {
        if (!newSelected) {
          newSelected = new Set(currentlySelected);
        }
        newSelected.delete(change.id);
      }
    }
  }
  return newSelected;
}

const defaultEdgeOptions = { markerEnd: { type: MarkerType.ArrowClosed, color: "black" } };
// It seems like it's OK to remove attribution if we aren't making money off our usage
// https://reactflow.dev/learn/troubleshooting/remove-attribution
const proOptions = { hideAttribution: true };

/// Component responsible for actually rendeirng the graph after it has been laid out
/// also responsible for
function Rendering({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNode: filteredNode,
  elkJSON,
}: {
  nodes: (FlowClass | FlowNode)[];
  edges: FlowEdge[];
  selectedNode: { type: "class" | "node"; id: string } | null;
  elkJSON: string;
}) {
  const nodeToEdges = useMemo(() => {
    // Each node is a source for some edges and a target for others, no node will be both a target and a source
    return new Map(
      [
        ...Object.entries(Object.groupBy(initialEdges, (edge) => edge.source)),
        ...Object.entries(Object.groupBy(initialEdges, (edge) => edge.target)),
      ].map(([nodeID, edges]) => [nodeID, (edges || []).map((edge) => edge.id)])
    );
  }, [initialEdges]);
  const edgeToNodes = useMemo(() => {
    return new Map(initialEdges.map((edge) => [edge.id, [edge.source, edge.target]]));
  }, [initialEdges]);
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  // Trigger this when we want to skip the next fitView, for example when we change selection
  const skipNextFitRef = useRef(false);

  const nodes = useMemo(
    () => initialNodes.map((node) => ({ ...node, selected: selectedNodes.has(node.id) })),
    [initialNodes, selectedNodes]
  );
  const edges = useMemo(
    () => initialEdges.map((edge) => ({ ...edge, selected: selectedEdges.has(edge.id) })),
    [initialEdges, selectedEdges]
  );

  // Handle node/edge selection
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode | FlowClass>[]) => {
      const newSelectedNodes = processSelectionChanges(changes, selectedNodes);
      if (newSelectedNodes) {
        const connectedEdges = [...newSelectedNodes].flatMap((node) => nodeToEdges.get(node)!);
        setSelectedNodes(newSelectedNodes);
        setSelectedEdges(new Set(connectedEdges));
        skipNextFitRef.current = true;
      }
    },
    [selectedNodes, setSelectedNodes, nodeToEdges, selectedEdges, setSelectedEdges]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const newSelectedEdges = processSelectionChanges(changes, selectedEdges);
      if (newSelectedEdges) {
        const connectedNodes = [...newSelectedEdges].flatMap((edge) => edgeToNodes.get(edge)!);
        setSelectedNodes(new Set(connectedNodes));
        setSelectedEdges(newSelectedEdges);
        skipNextFitRef.current = true;
      }
    },
    [selectedEdges, setSelectedEdges, edgeToNodes, selectedNodes, setSelectedNodes]
  );

  const selectNode = useContext(SetSelectedNodeContext)!;
  const unselectNode = useCallback(() => selectNode(null), [selectNode]);
  const onClickToELK = useCallback(() => {
    navigator.clipboard.writeText(elkJSON);
  }, [elkJSON]);

  // Re-fit when initial nodes/edges change, but not when selection changes
  const reactFlow = useReactFlow();
  const nodeInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodeInitialized) {
      if (skipNextFitRef.current) {
        skipNextFitRef.current = false;
      } else {
        reactFlow.fitView({ padding: 0.1 });
      }
    }
  }, [nodeInitialized, reactFlow, skipNextFitRef]);

  return (
    <ReactFlow
      nodes={nodes}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      edges={edges}
      minZoom={0.05}
      maxZoom={10}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={true}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      // nodeDragThreshold={100}
      // onNodeClick={onNodeClick}
      defaultEdgeOptions={defaultEdgeOptions}
      proOptions={proOptions}
    >
      {filteredNode ? (
        <Panel position="top-center">
          <button
            className="rounded bg-white px-2 py-1 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:shadow-md hover:ring-gray-400 transition-all duration-200"
            onClick={unselectNode}
          >
            Reset filter
          </button>
        </Panel>
      ) : (
        <></>
      )}
      <Panel position="top-right">
        <CodeBracketIcon
          title="Copy ELK JSON"
          className="h-6 w-6 cursor-pointer hover:text-blue-500 transition-colors duration-200"
          onClick={onClickToELK}
        />
      </Panel>

      {/* <Background /> */}
      <Controls />
      {/* Doesn't really show nodes when they are so small */}
      {/* <MiniMap nodeColor={nodeColor} nodeStrokeColor={nodeColor} zoomable pannable nodeStrokeWidth={1000} /> */}
    </ReactFlow>
  );
}

function LayoutFlow({
  egraph,
  outerElem,
  innerElem,
  aspectRatio,
}: {
  egraph: string;
  outerElem: HTMLDivElement;
  innerElem: HTMLDivElement;
  aspectRatio: number;
}) {
  // e-class ID we have currently selected, store egraph string as well so we know if this selection is outdated
  const [selectedNodeWithEGraph, setSelectedNodeWithEGraph] = useState<{ type: "class" | "node"; id: string; egraph: string } | null>(null);
  const selectedNode = useMemo(() => {
    if (selectedNodeWithEGraph && selectedNodeWithEGraph.egraph === egraph) {
      return selectedNodeWithEGraph;
    }
    return null;
  }, [selectedNodeWithEGraph, egraph]);
  const setSelectedNode = useCallback(
    (node: { type: "class" | "node"; id: string } | null) => {
      startTransition(() => {
        setSelectedNodeWithEGraph(node ? { ...node, egraph } : null);
      });
    },
    [setSelectedNodeWithEGraph, egraph]
  );
  const parsedEGraph: EGraph = useMemo(() => JSON.parse(egraph), [egraph]);

  const elkNode = useMemo(
    () => toELKNode(parsedEGraph, outerElem, innerElem, selectedNode, aspectRatio),
    [parsedEGraph, outerElem, innerElem, selectedNode, aspectRatio]
  );
  const beforeLayout = useMemo(() => JSON.stringify(elkNode, null, 2), [elkNode]);

  const layoutPromise = useMemo(() => elk.layout(elkNode) as Promise<MyELKNodeLayedOut>, [elkNode]);
  const layout = use(layoutPromise);
  const edges = useMemo(() => toFlowEdges(layout), [layout]);
  const nodes = useMemo(() => toFlowNodes(layout), [layout]);
  return (
    <SetSelectedNodeContext.Provider value={setSelectedNode}>
      <Rendering nodes={nodes} edges={edges} selectedNode={selectedNode} elkJSON={beforeLayout} />
    </SetSelectedNodeContext.Provider>
  );
}

function Visualizer({ egraph }: { egraph: string }) {
  const [outerElem, setOuterElem] = useState<HTMLDivElement | null>(null);
  const [innerElem, setInnerElem] = useState<HTMLDivElement | null>(null);

  const [rootElem, setRootElem] = useState<HTMLDivElement | null>(null);

  const aspectRatio = useMemo(() => {
    if (rootElem) {
      return rootElem.clientWidth / rootElem.clientHeight;
    }
  }, [rootElem]);
  return (
    <div className="w-full h-full" ref={setRootElem}>
      {/* Hidden node to measure text size  */}
      <div className="invisible absolute">
        <ENode outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <ReactFlowProvider>
        <ErrorBoundary fallback={<p>⚠️Something went wrong</p>}>
          <Suspense fallback={<div>Laying out graph...</div>}>
            {outerElem && innerElem && aspectRatio && (
              <LayoutFlow aspectRatio={aspectRatio} egraph={egraph} outerElem={outerElem} innerElem={innerElem} />
            )}
          </Suspense>
        </ErrorBoundary>
      </ReactFlowProvider>
    </div>
  );
}

export default Visualizer;
