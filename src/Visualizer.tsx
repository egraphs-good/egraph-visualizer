import "./index.css";
import "./react-aria-components-tailwind-starter/src/theme/index.css";
import "./react-aria-components-tailwind-starter/src/theme/accent-colors.css";
import "./react-aria-components-tailwind-starter/src/theme/avatar-initial-colors.css";
import "@xyflow/react/dist/style.css";
import {
  ArrowLongRightIcon,
  ArrowUturnRightIcon,
  Bars2Icon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

import type { EdgeChange, EdgeProps, EdgeTypes, NodeChange, NodeProps } from "@xyflow/react";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  NodeTypes,
  MarkerType,
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
import { AnyModel } from "@anywidget/types";
import { createRoot } from "react-dom/client";
import { AccessibleIcon } from "./react-aria-components-tailwind-starter/src/accessible-icon";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItemDescription,
  MenuItemLabel,
  MenuPopover,
  MenuSeparator,
  MenuTrigger,
} from "./react-aria-components-tailwind-starter/src/menu";
import { useCopyToClipboard } from "./react-aria-components-tailwind-starter/src/hooks/use-clipboard";
import { keepPreviousData, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { FlowClass, FlowEdge, FlowNode, layoutGraph, PreviousLayout, SelectedNode } from "./layout";
import { queryClient } from "./queryClient";
import { Loading } from "./Loading";

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
  nodeToEdges,
  edgeToNodes,
  elkJSON,
  useInteractiveLayout,
  setUseInteractiveLayout,
  mergeEdges,
  setMergeEdges,
}: {
  nodes: (FlowNode | FlowClass)[];
  edges: FlowEdge[];
  selectedNode: SelectedNode | null;
  nodeToEdges: Map<string, string[]>;
  edgeToNodes: Map<string, string[]>;
  elkJSON: string;
  useInteractiveLayout: boolean;
  setUseInteractiveLayout: (value: boolean) => void;
  mergeEdges: boolean;
  setMergeEdges: (value: boolean) => void;
}) {
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
    [selectedNodes, setSelectedNodes, nodeToEdges, setSelectedEdges]
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
    [selectedEdges, setSelectedEdges, edgeToNodes, setSelectedNodes]
  );

  const selectNode = useContext(SetSelectedNodeContext)!;
  const unselectNode = useCallback(() => selectNode(null), [selectNode]);

  // Re-fit when initial nodes/edges change, but not when selection changes
  const reactFlow = useReactFlow();
  const nodeInitialized = useNodesInitialized();
  useEffect(() => {
    if (nodeInitialized) {
      if (skipNextFitRef.current) {
        skipNextFitRef.current = false;
      } else {
        reactFlow.fitView({ padding: 0.1, duration: 1000 });
      }
    }
  }, [nodeInitialized, reactFlow, skipNextFitRef]);

  const [isOpen, setOpen] = useState(false);
  const clipboard = useCopyToClipboard();
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
        <MenuTrigger>
          <MenuButton onPress={() => setOpen((prev) => !prev)} noIndicator variant="plain" isIconOnly>
            <AccessibleIcon aria-label="Open setting menu">
              <CogIcon className="size-6" />
            </AccessibleIcon>
          </MenuButton>
          <MenuPopover placement="bottom right" isOpen={isOpen} onOpenChange={setOpen}>
            <Menu>
              <MenuItem
                onAction={useCallback(
                  () => setUseInteractiveLayout(!useInteractiveLayout),
                  [setUseInteractiveLayout, useInteractiveLayout]
                )}
                className="cursor-pointer"
              >
                <AccessibleIcon>{useInteractiveLayout ? <ArrowUturnRightIcon /> : <ArrowLongRightIcon />}</AccessibleIcon>
                <MenuItemLabel>Interactive layout</MenuItemLabel>
                <MenuItemDescription>
                  {useInteractiveLayout ? "Layout independently of previous positions" : "Layout interactively based on previous positions"}
                </MenuItemDescription>
              </MenuItem>
              <MenuItem onAction={useCallback(() => setMergeEdges(!mergeEdges), [setMergeEdges, mergeEdges])} className="cursor-pointer">
                <AccessibleIcon>{mergeEdges ? <ChevronRightIcon /> : <Bars2Icon />}</AccessibleIcon>
                <MenuItemLabel>Merge edges</MenuItemLabel>
                <MenuItemDescription>{mergeEdges ? "Seperate ports for incoming edges" : "Merge all incoming edges"}</MenuItemDescription>
              </MenuItem>
              <MenuSeparator />
              <MenuItem onAction={useCallback(() => clipboard.copy(elkJSON), [elkJSON, clipboard])} className="cursor-pointer">
                <AccessibleIcon>
                  <ClipboardDocumentListIcon />
                </AccessibleIcon>
                <MenuItemLabel>Copy ELK</MenuItemLabel>
                <MenuItemDescription>
                  {clipboard.copied
                    ? "Copied ELK JSON to clipboard"
                    : clipboard.error
                    ? `Failed to copy ELK JSON to clipboard ${clipboard.error.message}`
                    : "Copy ELK JSON to clipboard"}
                </MenuItemDescription>
              </MenuItem>
            </Menu>
          </MenuPopover>
        </MenuTrigger>
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
  const [useInteractiveLayout, setUseInteractiveLayout] = useState(false);
  const [mergeEdges, setMergeEdges] = useState(false);
  const previousLayoutRef = useRef<PreviousLayout | null>(null);
  // e-class ID we have currently selected, store egraph string as well so we know if this selection is outdated
  const [selectedNodeWithEGraph, setSelectedNodeWithEGraph] = useState<(SelectedNode & { egraph: string }) | null>(null);
  const selectedNode = useMemo(() => {
    if (selectedNodeWithEGraph && selectedNodeWithEGraph.egraph === egraph) {
      return selectedNodeWithEGraph;
    }
    return null;
  }, [selectedNodeWithEGraph, egraph]);
  const setSelectedNode = useCallback(
    (node: { type: "class" | "node"; id: string } | null) => {
      setSelectedNodeWithEGraph(node ? { ...node, egraph } : null);
    },
    [setSelectedNodeWithEGraph, egraph]
  );

  const getNodeSize = useCallback(
    (contents: string) => {
      innerElem.innerText = contents;
      return outerElem.getBoundingClientRect();
    },
    [outerElem, innerElem]
  );
  const previousLayout = useInteractiveLayout ? previousLayoutRef.current : null;
  const layoutQuery = useQuery({
    queryKey: ["layout", egraph, getNodeSize, aspectRatio, selectedNode, previousLayout, mergeEdges],
    networkMode: "always",
    queryFn: ({ signal }) => layoutGraph(egraph, getNodeSize, aspectRatio, selectedNode, previousLayout, mergeEdges, signal),
    staleTime: Infinity,
    retry: false,
    retryOnMount: false,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (layoutQuery.status === "success") {
      previousLayoutRef.current = layoutQuery.data.layout;
    }
  }, [layoutQuery.status, layoutQuery.data]);

  if (layoutQuery.isError) {
    return <div className="p-4">Error: {layoutQuery.error.message}</div>;
  }
  if (layoutQuery.isPending) {
    return <Loading />;
  }

  const { nodes, edges, elkJSON, nodeToEdges, edgeToNodes } = layoutQuery.data;

  return (
    <>
      {layoutQuery.isFetching ? <Loading /> : <></>}
      <SetSelectedNodeContext.Provider value={setSelectedNode}>
        <Rendering
          nodes={nodes}
          edges={edges}
          nodeToEdges={nodeToEdges}
          edgeToNodes={edgeToNodes}
          selectedNode={selectedNode}
          elkJSON={elkJSON}
          useInteractiveLayout={useInteractiveLayout}
          setUseInteractiveLayout={setUseInteractiveLayout}
          mergeEdges={mergeEdges}
          setMergeEdges={setMergeEdges}
        />
      </SetSelectedNodeContext.Provider>
    </>
  );
}

export function Visualizer({ egraph, height = null, resize = false }: { egraph: string; height?: string | null; resize?: boolean }) {
  const [outerElem, setOuterElem] = useState<HTMLDivElement | null>(null);
  const [innerElem, setInnerElem] = useState<HTMLDivElement | null>(null);

  const [rootElem, setRootElem] = useState<HTMLDivElement | null>(null);

  const aspectRatio = useMemo(() => {
    if (rootElem) {
      return rootElem.clientWidth / rootElem.clientHeight;
    }
  }, [rootElem]);
  return (
    <div className={`w-full relative ${resize ? "resize-y" : ""}`} style={{ height: height || "100%" }} ref={setRootElem}>
      {/* Hidden node to measure text size  */}
      <div className="invisible absolute">
        <ENode outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <ReactFlowProvider>
        {outerElem && innerElem && aspectRatio && (
          <LayoutFlow aspectRatio={aspectRatio} egraph={egraph} outerElem={outerElem} innerElem={innerElem} />
        )}
      </ReactFlowProvider>
    </div>
  );
}

// Put these both in one file, so its emitted as a single chunk and anywidget doesn't have to import another file

function VisualizerWithTransition({
  initialEgraph,
  registerChangeEGraph,
  resize,
  height,
}: {
  initialEgraph: string;
  registerChangeEGraph: (setEgraph: (egraph: string) => void) => void;
  resize?: boolean;
  height?: string;
}) {
  const [egraph, setEgraph] = useState(initialEgraph);
  useEffect(() => {
    registerChangeEGraph(setEgraph);
  }, [registerChangeEGraph, setEgraph]);
  return (
    <QueryClientProvider client={queryClient}>
      <Visualizer egraph={egraph} height={height} resize={resize} />
    </QueryClientProvider>
  );
}

/// Render anywidget model to the given element
// Must be named `render` to work as an anywidget module
// https://anywidget.dev/en/afm/#lifecycle-methods
// eslint-disable-next-line react-refresh/only-export-components
export function render({ model, el }: { el: HTMLElement; model: AnyModel }) {
  const root = createRoot(el);
  let callback: () => void;
  const registerChangeEGraph = (setEgraph: (egraph: string) => void) => {
    callback = () => setEgraph(model.get("egraph"));
    model.on("change:egraph", callback);
  };
  root.render(
    <VisualizerWithTransition initialEgraph={model.get("egraph")} registerChangeEGraph={registerChangeEGraph} height="600px" resize />
  );

  return () => {
    model.off("change:egraph", callback);
    root.unmount();
  };
}

/// Mount the visualizer to the given element
/// Call `render` to render a new egraph
/// Call `unmount` to unmount the visualizer
// eslint-disable-next-line react-refresh/only-export-components
export function mount(element: HTMLElement): { render: (egraph: string) => void; unmount: () => void } {
  const root = createRoot(element);
  let setEgraph: null | ((egraph: string) => void) = null;
  function render(egraph: string) {
    if (setEgraph) {
      setEgraph(egraph);
    } else {
      root.render(
        <VisualizerWithTransition
          initialEgraph={egraph}
          registerChangeEGraph={(setEgraph_) => {
            setEgraph = setEgraph_;
          }}
        />
      );
    }
  }

  function unmount() {
    root.unmount();
  }
  return { render, unmount };
}
