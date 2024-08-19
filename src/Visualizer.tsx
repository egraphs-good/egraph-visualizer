/// <reference types="react/canary" />

import "@xyflow/react/dist/style.css";

import { ErrorBoundary } from "react-error-boundary";
import ELK, { ElkExtendedEdge, ElkNode, ElkPrimitiveEdge } from "elkjs/lib/elk.bundled.js";
import { memo, Suspense, use, useMemo, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, Node, Panel, Edge, NodeTypes, Position, Handle, Background } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

// Elk has a *huge* amount of options to configure. To see everything you can
// tweak check out:
//
// - https://www.eclipse.org/elk/reference/algorithms.html
// - https://www.eclipse.org/elk/reference/options.html

const elk = new ELK({
  defaultLayoutOptions: {
    "elk.algorithm": "layered",
    "elk.layered.spacing.nodeNodeBetweenLayers": "100",
    "elk.spacing.nodeNode": "80",
    "elk.direction": "DOWN",
    "elk.portConstraints": "FIXED_SIDE",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    // "elk.layered.spacing.baseValue": "40",
    // "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  },
});

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

// https://github.com/vega/editor/blob/8bcc0fc997dbf3bdcecf4584ffd742fc33ddb042/src/features/dataflow/utils/measureText.ts

const ctx = document.createElement("canvas").getContext("2d");
const fontFamily = "monospace";
const fontSize = "12px";

ctx!.font = `${fontSize} ${fontFamily}`;

export type Size = { width: number; height: number };

// We wil convert this to a graph where the id of the nodes are class-{class_id} and node-{node_id}
// the ID of the edges will be edge-{source_id}-{port-index} and the ports will be port-{source_id}-{port-index}
function toELKNode(egraph: EGraph, outerElem: HTMLDivElement, innerElem: HTMLDivElement): ElkNode {
  const nodeToClass = new Map<EGraphNodeID, EGraphClassID>();
  const classToNodes = new Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>();
  for (const [id, node] of Object.entries(egraph.nodes)) {
    nodeToClass.set(id, node.eclass);
    if (!classToNodes.has(node.eclass)) {
      classToNodes.set(node.eclass, []);
    }
    classToNodes.get(node.eclass)!.push([id, node]);
  }

  const children = [...classToNodes.entries()].map(([id, nodes]) => {
    const parentID = `class-${id}`;
    return {
      id: parentID,
      data: { type: egraph.class_data[id].type || null, port: `port-${id}` },
      type: "class",
      children: nodes.map(([id, node]) => {
        const ports = Object.keys(node.children).map((index) => ({
          id: `port-${id}-${index}`,
        }));
        // compute the size of the text by setting a dummy node element then measureing it
        innerElem.innerText = node.op;
        const size = outerElem.getBoundingClientRect();
        return {
          id: `node-${id}`,
          type: "node",
          parentId: parentID,
          data: { label: node.op, ports },
          width: size.width,
          height: size.height,
          // one port for every index
          ports,
        };
      }),
    };
  });

  const edges: ElkPrimitiveEdge[] = Object.entries(egraph.nodes).flatMap(([id, node]) =>
    [...node.children.entries()].map(([index, childNode]) => {
      const sourcePort = `port-${id}-${index}`;
      const class_ = nodeToClass.get(childNode)!;
      const targetPort = `port-${class_}`;
      return {
        id: `edge-${id}-${index}`,
        source: `node-${id}`,
        sourcePort,
        sourceHandle: sourcePort,
        target: `class-${class_}`,
        targetPort,
        targetHandle: targetPort,
      };
    })
  );
  return {
    id: "--eclipse-layout-kernel-root",
    children,
    edges: edges as unknown as ElkExtendedEdge[],
  };
}

// This function takes an EGraph and returns an ELK node that can be used to layout the graph.
function toFlowNodes(layout: ElkNode): Node[] {
  return layout.children!.flatMap(({ children, x, y, data, id, type, height, width }) => [
    { position: { x, y }, data, id, type, height, width } as unknown as Node,
    ...children!.map(
      ({ x, y, height, width, data, id, type, parentId }) =>
        ({
          data,
          id,
          type,
          parentId,
          position: { x, y },
          width,
          height,
        } as unknown as Node)
    ),
  ]);
}

export function EClassNode({ data }: { data: { port: string; type: string | null } }) {
  return (
    <div className="rounded-md border border-dotted border-stone-400 h-full w-full">
      <Handle type="target" id={data.port} position={Position.Top} className="invisible" />
    </div>
  );
}

export function ENode({
  data,
  ...rest
}: {
  data: { label: string; ports: { id: string }[] };
  outerRef?: React.Ref<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="p-1 rounded-md border bg-white border-stone-400 h-full w-full" ref={rest?.outerRef}>
      <div className="font-mono truncate max-w-96" ref={rest?.innerRef}>
        {data.label}
      </div>
      {data.ports.map(({ id }) => (
        <Handle key={id} type="source" position={Position.Bottom} id={id} style={{ top: 10, background: "#555" }} />
      ))}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  class: memo(EClassNode),
  node: memo(ENode),
};

function LayoutFlow({ egraph, outerElem, innerElem }: { egraph: string; outerElem: HTMLDivElement; innerElem: HTMLDivElement }) {
  const parsedEGraph: EGraph = useMemo(() => JSON.parse(egraph), [egraph]);
  const elkNode = useMemo(() => toELKNode(parsedEGraph, outerElem, innerElem), [parsedEGraph, outerElem, innerElem]);
  const edges = useMemo(() => elkNode.edges!.map((e) => ({ ...e })), [elkNode]);
  const layoutPromise = useMemo(() => elk.layout(elkNode), [elkNode]);
  const layout = use(layoutPromise);
  const nodes = useMemo(() => toFlowNodes(layout), [layout]);
  return (
    <ReactFlow nodes={nodes} nodeTypes={nodeTypes} edges={edges} fitView minZoom={0.05}>
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
