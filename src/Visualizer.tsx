/// <reference types="react/canary" />

import "@xyflow/react/dist/style.css";
import { CodeBracketIcon } from "@heroicons/react/24/outline";

import { scheme } from "vega-scale";
import { ErrorBoundary } from "react-error-boundary";
import type { EdgeProps, EdgeTypes, NodeProps } from "@xyflow/react";

import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import ELKWorkerURL from "elkjs/lib/elk-worker?url";

import { createContext, memo, startTransition, Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  NodeTypes,
  NodeMouseHandler,
  Background,
  MarkerType,
  Edge,
  useNodesInitialized,
  useReactFlow,
  BaseEdge,
  Handle,
  Position,
  Controls,
  Panel,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import { compressToEncodedURIComponent } from "lz-string";

// Elk has a *huge* amount of options to configure. To see everything you can
// tweak check out:
//
// - https://www.eclipse.org/elk/reference/algorithms.html
// - https://www.eclipse.org/elk/reference/options.html
const layoutOptions = {
  "elk.algorithm": "layered",
  // "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  // "elk.spacing.nodeNode": "80",
  "elk.direction": "DOWN",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.mergeEdges": "True",
  // "elk.edgeRouting": "SPLINES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",

  "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE",
  // "elk.layered.spacing.baseValue": "40",
  // "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
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

type MyELKEdge = ElkExtendedEdge & { data: { sourceNode: string } };
/// ELK Node but with additional data added to be later used when converting to react flow nodes
type MyELKNode = Omit<ElkNode, "children" | "edges"> & {
  edges: MyELKEdge[];
  children: ({
    type: NonNullable<FlowClass["type"]>;
    data: FlowClass["data"];
    edges: MyELKEdge[];
    children: {
      type: NonNullable<FlowNode["type"]>;
      width: number;
      height: number;
      data: FlowNode["data"];
    }[] &
      ElkNode[];
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
  selectedNode: { type: "class" | "node"; id: string } | null
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
      const current: string = toTraverse.values().next().value;
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

  const children = [...classToNodes.entries()].map(([id, nodes]) => {
    return {
      id: `class-${id}`,
      data: { color: typeToColor.get(class_data[id]?.type)!, port: `port-${id}`, id },
      type: "class" as const,
      children: nodes.map(([id, node]) => {
        // compute the size of the text by setting a dummy node element then measureing it
        innerElem.innerText = node.op;
        const size = outerElem.getBoundingClientRect();
        return {
          id: `node-${id}`,
          type: "node" as const,
          data: { label: node.op, id },
          width: size.width,
          height: size.height,
          labels: [{ text: node.op }],
          layoutOptions: {
            portConstraints: "FIXED_SIDE",
          },
          ports: Object.keys(node.children || []).map((index) => ({
            id: `port-${id}-${index}`,
            layoutOptions: {
              "port.side": "SOUTH",
            },
          })),
        };
      }),
      edges: nodes.flatMap(([id, node]) =>
        [...(node.children || []).entries()].map(([index, childNode]) => ({
          id: `edge-${id}-${index}`,
          data: { sourceNode: `node-${id}` },
          sources: [`port-${id}-${index}`],
          targets: [`class-${nodeToClass.get(childNode)!}`],
        }))
      ),
    };
  });

  // move all edges that aren't self loops to the root
  // https://github.com/eclipse/elk/issues/1068
  const edges = [];
  for (const child of children) {
    const { loop, not } = Object.groupBy(child.edges, ({ targets }) => (targets[0] === child.id ? "loop" : "not"));
    child.edges = loop || [];
    edges.push(...(not || []));
  }

  return {
    id: "--eclipse-layout-kernel-root",
    layoutOptions,
    children,
    edges,
  };
}

// This function takes an EGraph and returns an ELK node that can be used to layout the graph.
function toFlowNodes(layout: MyELKNodeLayedOut): (FlowClass | FlowNode)[] {
  return layout.children.flatMap(({ children, x, y, data, id: parentId, type, height, width }) => [
    { position: { x, y }, data, id: parentId, type, height, width },
    ...children!.map(({ x, y, height, width, data, id, type }) => ({
      data,
      id,
      type,
      parentId,
      position: { x, y },
      width,
      height,
    })),
  ]);
}

function toFlowEdges(layout: MyELKNodeLayedOut): FlowEdge[] {
  const containerToPosition = { [layout.id]: { x: 0, y: 0 }, ...Object.fromEntries(layout.children.map(({ id, x, y }) => [id, { x, y }])) };
  const allEdges = [...layout.edges!, ...layout.children.flatMap(({ edges }) => edges!.map((edge) => edge))];
  return allEdges.map(({ id, sections, data: { sourceNode }, ...rest }) => {
    const [section] = sections!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containerPosition = containerToPosition[(rest as any).container];
    return {
      type: "edge",
      id,
      source: sourceNode,
      target: section.outgoingShape!,
      data: {
        // Add container start to edge so that this is correct for edges nested in parents which are needed for self edges
        points: [section.startPoint, ...(section.bendPoints || []), section.endPoint].map(({ x, y }) => ({
          x: x + containerPosition.x,
          y: y + containerPosition.y,
        })),
      },
    };
  });
}

export function EClassNode({ data }: NodeProps<FlowClass>) {
  return (
    <div className="rounded-md border border-dotted border-stone-400 h-full w-full" style={{ backgroundColor: data.color! || "white" }}>
      {/* <MyNodeToolbar type="class" id={data.id} selected={data.selected} /> */}
      <Handle type="target" position={Position.Top} className="invisible" />
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
    <div className="p-1 rounded-md border bg-white border-stone-400 h-full w-full" ref={props?.outerRef}>
      {/* {props?.outerRef ? <></> : <MyNodeToolbar type="class" id={props!.data!.id} selected={props!.data!.selected} />} */}

      <div className="font-mono text-xs truncate max-w-96" ref={props?.innerRef}>
        {props?.data?.label}
      </div>
      {/* Only show handle if we aren't rendering this to calculate size */}
      {props?.outerRef ? <></> : <Handle type="source" position={Position.Bottom} className="invisible" />}
    </div>
  );
}

// export function MyNodeToolbar(node: { type: "class" | "node"; id: string; selected: boolean | undefined }) {
//   const selectNode = useContext(SetSelectedNodeContext);

//   const onClick = useCallback(() => {
//     startTransition(() => selectNode!(node));
//   }, [selectNode, node]);

//   return (
//     <NodeToolbar position={Position.Top} isVisible={node.selected || false}>
//       <button
//         onClick={onClick}
//         className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
//       >
//         Filter descendants
//       </button>
//     </NodeToolbar>
//   );
// }

export function CustomEdge({ markerEnd, data }: EdgeProps<FlowEdge>) {
  const { points } = data!;
  const edgePath = points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return <BaseEdge path={edgePath} markerEnd={markerEnd} />;
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
const SetSelectedNodeContext = createContext<null | ((node: { type: "class" | "node"; id: string }) => void)>(null);

// function nodeColor(node: FlowClass | FlowNode): string {
//   return node.type === "class" ? node.data.color! : "white";
// }

function LayoutFlow({ egraph, outerElem, innerElem }: { egraph: string; outerElem: HTMLDivElement; innerElem: HTMLDivElement }) {
  const parsedEGraph: EGraph = useMemo(() => JSON.parse(egraph), [egraph]);
  /// e-class ID we have currently selected
  const [selectedNode, setSelectedNode] = useState<{ type: "class" | "node"; id: string } | null>(null);
  const elkNode = useMemo(
    () => toELKNode(parsedEGraph, outerElem, innerElem, selectedNode),
    [parsedEGraph, outerElem, innerElem, selectedNode]
  );
  const beforeLayout = useMemo(() => JSON.stringify(elkNode, null, 2), [elkNode]);
  const layoutPromise = useMemo(() => elk.layout(elkNode) as Promise<MyELKNodeLayedOut>, [elkNode]);
  const layout = use(layoutPromise);
  const edges = useMemo(() => toFlowEdges(layout), [layout]);
  const nodes = useMemo(() => toFlowNodes(layout), [layout]);

  // Fit the view when the nodes are initialized, which happens initially and after a filter
  const reactFlow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodesInitialized) {
      reactFlow.fitView({ padding: 0.1 });
    }
  }, [reactFlow, nodesInitialized]);

  const unselectNode = useCallback(
    () =>
      startTransition(() => {
        // reactFlow.updateNodeData(selectedNode!.id, { selected: false });
        setSelectedNode(null);
      }),
    [setSelectedNode]
  );

  const onNodeClick = useCallback(
    ((_, node) => {
      startTransition(() => {
        setSelectedNode({ type: node.type!, id: node.data.id });
      });
    }) as NodeMouseHandler<FlowClass | FlowNode>,
    [setSelectedNode]
  );

  return (
    <SetSelectedNodeContext.Provider value={setSelectedNode}>
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
        // nodeDragThreshold={100}
        onNodeClick={onNodeClick}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        {selectedNode ? (
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
            title="Open in ELK Live editor"
            className="h-6 w-6 cursor-pointer hover:text-blue-500 transition-colors duration-200"
            onClick={useCallback(() => {
              const compressedContent = compressToEncodedURIComponent(beforeLayout);
              const url = new URL(`https://rtsys.informatik.uni-kiel.de/elklive/json.html?compressedContent=${compressedContent}`);
              window.open(url, "_blank", "noopener,noreferrer");
            }, [beforeLayout])}
          />
        </Panel>

        <Background />
        <Controls />
        {/* Doesn't really show nodes when they are so small */}
        {/* <MiniMap nodeColor={nodeColor} nodeStrokeColor={nodeColor} zoomable pannable nodeStrokeWidth={1000} /> */}
      </ReactFlow>
    </SetSelectedNodeContext.Provider>
  );
}

function Visualizer({ egraph }: { egraph: string }) {
  const [outerElem, setOuterElem] = useState<HTMLDivElement | null>(null);
  const [innerElem, setInnerElem] = useState<HTMLDivElement | null>(null);

  return (
    <>
      {/* Hidden node to measure text size  */}
      <div className="invisible absolute">
        <ENode outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <ReactFlowProvider>
        <ErrorBoundary fallback={<p>⚠️Something went wrong</p>}>
          <Suspense fallback={<div>Laying out graph...</div>}>
            {outerElem && innerElem && <LayoutFlow key={egraph} egraph={egraph} outerElem={outerElem} innerElem={innerElem} />}
          </Suspense>
        </ErrorBoundary>
      </ReactFlowProvider>
    </>
  );
}

export default Visualizer;
