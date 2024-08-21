/// <reference types="react/canary" />

import "@xyflow/react/dist/style.css";

import { scheme } from "vega-scale";
import { ErrorBoundary } from "react-error-boundary";
import type { EdgeProps, EdgeTypes, NodeProps } from "@xyflow/react";

import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import ELKWorkerURL from "elkjs/lib/elk-worker?url";

import { memo, startTransition, Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  Panel,
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
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

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
  "elk.portConstraints": "FIXED_SIDE",
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

type FlowClass = Node<{ color: string | null; id: string }, "class">;
type FlowNode = Node<{ label: string; id: string }, "node">;
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
  const type_to_color = new Map<string | undefined, Color>();
  for (const { type } of Object.values(class_data)) {
    if (!type_to_color.has(type)) {
      type_to_color.set(type, colorScheme[type_to_color.size % colorScheme.length]);
    }
  }

  const children = [...classToNodes.entries()].map(([id, nodes]) => {
    return {
      id: `class-${id}`,
      data: { color: type_to_color.get(class_data[id]?.type) || null, port: `port-${id}`, id },
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
  const allEdges = [...layout.edges!, ...layout.children.flatMap(({ edges }) => edges!)];
  return allEdges.map(({ id, sections, data: { sourceNode } }) => {
    const [section] = sections!;
    return {
      type: "edge",
      id,
      source: sourceNode,
      target: section.outgoingShape!,
      data: {
        points: [section.startPoint, ...(section.bendPoints || []), section.endPoint],
      },
    };
  });
}

export function EClassNode({ data }: NodeProps<FlowClass>) {
  return (
    <div className="rounded-md border border-dotted border-stone-400 h-full w-full" style={{ backgroundColor: data.color! }}>
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
      <div className="font-mono truncate max-w-96" ref={props?.innerRef}>
        {props?.data?.label}
      </div>
      {/* Only show handle if we aren't rendering this to calculate size */}
      {props?.outerRef ? <></> : <Handle type="source" position={Position.Bottom} className="invisible" />}
    </div>
  );
}

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

function LayoutFlow({ egraph, outerElem, innerElem }: { egraph: string; outerElem: HTMLDivElement; innerElem: HTMLDivElement }) {
  const parsedEGraph: EGraph = useMemo(() => JSON.parse(egraph), [egraph]);
  /// e-class ID we have currently selected
  const [selectedNode, setSelectedNode] = useState<{ type: "class" | "node"; id: string } | null>(null);
  const elkNode = useMemo(
    () => toELKNode(parsedEGraph, outerElem, innerElem, selectedNode),
    [parsedEGraph, outerElem, innerElem, selectedNode]
  );
  const layoutPromise = useMemo(() => elk.layout(elkNode) as Promise<MyELKNodeLayedOut>, [elkNode]);
  const layout = use(layoutPromise);
  const edges = useMemo(() => toFlowEdges(layout), [layout]);
  const nodes = useMemo(() => toFlowNodes(layout), [layout]);
  const onNodeClick = useCallback(
    ((_, node) => {
      // Use start transition so that the whole component doesn't re-render
      startTransition(() => setSelectedNode({ type: node.type!, id: node.data.id }));
    }) as NodeMouseHandler<FlowClass | FlowNode>,
    [setSelectedNode]
  );

  // Fit the view when the nodes are initialized, which happens initially and after a filter
  const reactFlow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodesInitialized) {
      reactFlow.fitView({ padding: 0.1 });
    }
  }, [reactFlow, nodesInitialized]);

  return (
    <ReactFlow
      nodes={nodes}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      edges={edges}
      minZoom={0.05}
      maxZoom={10}
      defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelectedNode(null)}
    >
      <Background />
    </ReactFlow>
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
