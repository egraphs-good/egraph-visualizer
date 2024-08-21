/// <reference types="react/canary" />

import "@xyflow/react/dist/style.css";

import { scheme } from "vega-scale";
import { ErrorBoundary } from "react-error-boundary";
import ELK, { ElkNode, ElkPrimitiveEdge } from "elkjs/lib/elk.bundled.js";
import { memo, startTransition, Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  Panel,
  NodeTypes,
  NodeMouseHandler,
  Position,
  Handle,
  Background,
  MarkerType,
  Edge,
  useNodesInitialized,
  useReactFlow,
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
  // "elk.layered.mergeEdges": "True",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",

  // "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE_SOFT",
  // "elk.layered.spacing.baseValue": "40",
  // "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

const elk = new ELK();

type EGraphNodeID = string;
type EGraphClassID = string;
type EGraphNode = {
  op: string;
  children: EGraphNodeID[];
  eclass: EGraphClassID;
  cost: number;
};

type EGraphClassData = {
  type?: string;
};
type EGraph = {
  nodes: { [id: EGraphNodeID]: EGraphNode };
  root_eclasses: EGraphClassID[];
  class_data: { [id: EGraphClassID]: EGraphClassData };
};

type Color = string;
// Use these color schemes for the nodes
// https://vega.github.io/vega/docs/schemes/#categorical
const colorScheme: Color[] = [...scheme("pastel1"), ...scheme("pastel2")];

/// ELK Node but with additional data added to be later used when converting to react flow nodes
type MyELKNode = Omit<ElkNode, "children"> & {
  children: ({
    type: string;
    data: { color: string | null; port: string; id: string };
    children: {
      type: string;
      width: number;
      height: number;
      data: { label: string; ports: { id: string }[]; id: string };
    }[] &
      ElkNode[];
  } & Omit<ElkNode, "children" | "position">)[];
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
      for (const childNode of classToNodes.get(current)!.flatMap(([, node]) => node.children)) {
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

  const type_to_color = new Map<string | undefined, Color>();
  for (const { type } of Object.values(egraph.class_data)) {
    if (!type_to_color.has(type)) {
      type_to_color.set(type, colorScheme[type_to_color.size % colorScheme.length]);
    }
  }

  const children = [...classToNodes.entries()].map(([id, nodes]) => {
    return {
      id: `class-${id}`,
      data: { color: type_to_color.get(egraph.class_data[id]?.type) || null, port: `port-${id}`, id },
      ports: [
        // {
        //   id: `port-${id}`,
        //   layoutOptions: {
        //     "port.side": "NORTH",
        //   },
        // },
      ],
      type: "class",
      children: nodes.map(([id, node]) => {
        const ports = Object.keys(node.children).map((index) => ({
          id: `port-${id}-${index}`,
          layoutOptions: {
            "port.side": "SOUTH",
          },
        }));
        // compute the size of the text by setting a dummy node element then measureing it
        innerElem.innerText = node.op;
        const size = outerElem.getBoundingClientRect();
        return {
          id: `node-${id}`,
          type: "node",
          data: { label: node.op, ports, id },
          width: size.width,
          height: size.height,
          // one port for every index
          ports,
        };
      }),
      edges: nodes.flatMap(([id, node]) =>
        [...node.children.entries()].flatMap(([index, childNode]) => {
          const sourcePort = `port-${id}-${index}`;
          const class_ = nodeToClass.get(childNode)!;
          // only include if this is a self loop
          if (class_ != id) {
            return [];
          }
          // If the target or source class is not in the selected nodes, don't draw the edge
          const targetPort = `port-${class_}`;
          return [
            {
              id: `edge-${id}-${index}`,
              source: `node-${id}`,
              sourcePort,
              sourceHandle: sourcePort,
              target: `class-${class_}`,
              targetPort,
              targetHandle: targetPort,
            },
          ];
        })
      ),
    };
  });

  const edges: ElkPrimitiveEdge[] = Object.entries(egraph.nodes).flatMap(([id, node]) =>
    [...node.children.entries()].flatMap(([index, childNode]) => {
      const sourcePort = `port-${id}-${index}`;
      const class_ = nodeToClass.get(childNode)!;
      // If the target or source class is not in the selected nodes, don't draw the edge
      if (
        !classToNodes.get(node.eclass)?.find(([sourceID]) => sourceID == id) ||
        !classToNodes.has(class_) ||
        class_ == nodeToClass.get(id)
      ) {
        return [];
      }
      const targetPort = `port-${class_}`;
      return [
        {
          id: `edge-${id}-${index}`,
          source: `node-${id}`,
          sourcePort,
          sourceHandle: sourcePort,
          target: `class-${class_}`,
          targetPort,
          targetHandle: targetPort,
        },
      ];
    })
  );
  return {
    id: "--eclipse-layout-kernel-root",
    layoutOptions,
    children,
    edges,
  };
}

// This function takes an EGraph and returns an ELK node that can be used to layout the graph.
function toFlowNodes(layout: MyELKNodeLayedOut): Node[] {
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

export function EClassNode({ data }: { data: { port: string; color: string; id: string } }) {
  return (
    <div className="rounded-md border border-dotted border-stone-400 h-full w-full" style={{ backgroundColor: data.color }}>
      <Handle className="top-0 bottom-0 opacity-0  translate-0" type="target" id={data.port} position={Position.Top} />
    </div>
  );
}

export function ENode({
  data,
  ...rest
}: {
  data: { label: string; ports: { id: string }[]; id: string };
  outerRef?: React.Ref<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="p-1 rounded-md border bg-white border-stone-400 h-full w-full" ref={rest?.outerRef}>
      <div className="font-mono truncate max-w-96" ref={rest?.innerRef}>
        {data.label}
      </div>
      {/* Place at bottom of parent so that handles just touch the node */}
      <div className="flex justify-around absolute bottom-0 w-full">
        {data.ports.map(({ id }) => (
          <Handle
            className="relative left-auto transform-none opacity-0 translate-0"
            key={id}
            type="source"
            position={Position.Bottom}
            id={id}
          />
        ))}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  class: memo(EClassNode),
  node: memo(ENode),
};

function LayoutFlow({ egraph, outerElem, innerElem }: { egraph: string; outerElem: HTMLDivElement; innerElem: HTMLDivElement }) {
  const parsedEGraph: EGraph = useMemo(() => JSON.parse(egraph), [egraph]);
  /// e-class ID we have currently selected
  const [selectedNode, setSelectedNode] = useState<{ type: "class" | "node"; id: string } | null>(null);
  const elkNode = useMemo(() => {
    const r = toELKNode(parsedEGraph, outerElem, innerElem, selectedNode);
    // console.log(JSON.parse(JSON.stringify(r, null, 2)));
    return r;
  }, [parsedEGraph, outerElem, innerElem, selectedNode]);
  const edges = useMemo(
    () => [...elkNode.children.flatMap((c) => c.edges!.map((e) => ({ ...e }))), ...elkNode.edges!.map((e) => ({ ...e }))],
    [elkNode]
  );
  const layoutPromise = useMemo(() => elk.layout(elkNode) as Promise<MyELKNodeLayedOut>, [elkNode]);
  const layout = use(layoutPromise);
  const nodes = useMemo(() => toFlowNodes(layout), [layout]);
  const onNodeClick = useCallback(
    ((_, node) => {
      startTransition(() => setSelectedNode({ type: node.type! as "class" | "node", id: node.data!.id! as string }));
    }) as NodeMouseHandler,
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
      edges={edges as unknown as Edge[]}
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
        <ENode data={{ label: "test", ports: [] }} outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <ReactFlowProvider>
        <ErrorBoundary fallback={<p>⚠️Something went wrong</p>}>
          <Suspense fallback={<Panel>Loading...</Panel>}>
            {outerElem && innerElem && <LayoutFlow egraph={egraph} outerElem={outerElem} innerElem={innerElem} />}
          </Suspense>
        </ErrorBoundary>
      </ReactFlowProvider>
    </>
  );
}

export default Visualizer;
