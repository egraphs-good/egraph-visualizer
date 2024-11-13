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
  CircleStackIcon,
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
import { Slider, SliderOutput, SliderTack } from "./react-aria-components-tailwind-starter/src/slider";
import { NumberField, NumberInput } from "./react-aria-components-tailwind-starter/src/number-field";
import { Label } from "./react-aria-components-tailwind-starter/src/field";

const INITIAL_MAX_NODES = 500;

// TODO: Switch to finding root nodes with longest path and allow backwards expansions
// Must only do it on first connected sub-graph

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
  const subsumed = props?.data?.subsumed || false;
  const hidden = props?.data?.hidden;
  return (
    <div
      className={`p-1 rounded-md outline bg-white ${subsumed ? "outline-gray-300" : "outline-black"} h-full w-full ${
        props?.selected ? "outline-2" : "outline-1"
      }`}
      ref={props?.outerRef}
    >
      {props?.outerRef ? <></> : <MyNodeToolbar type="node" id={props!.data!.id} hidden={hidden} />}

      <div
        className={`font-mono text-xs truncate max-w-96 min-w-4 text-center ${subsumed ? "text-gray-300" : ""}`}
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

export function MyNodeToolbar(node: { type: "class" | "node"; id: string; hidden?: boolean }) {
  const selectNode = useContext(SetSelectedNodeContext);
  const setHidden = useContext(SetHiddenContext);
  const onClick = useCallback(() => selectNode!(node), [selectNode, node]);
  return (
    <NodeToolbar position={Position.Top}>
      <button
        onClick={onClick}
        className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Filter
      </button>
      {node.hidden != undefined ? (
        <button
          onClick={() => setHidden!(node.id, !node.hidden)}
          className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          {node.hidden ? "Show" : "Hide"}
        </button>
      ) : (
        <></>
      )}
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

const SetHiddenContext = createContext<null | ((id: string, hidden: boolean) => void)>(null);

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
  initialMaxNodes,
  setInitialMaxNodes,
  hiddenNodeStats: { visible, total },
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
  initialMaxNodes: number;
  setInitialMaxNodes: (value: number) => void;
  hiddenNodeStats: { visible: number; total: number };
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
              <MenuItem>
                <AccessibleIcon>
                  <CircleStackIcon />
                </AccessibleIcon>
                <NumberField value={initialMaxNodes} onChange={setInitialMaxNodes} step={100} className="flex-1 justify-between">
                  <Label>Max Initial Nodes</Label>
                  <NumberInput />
                </NumberField>
              </MenuItem>
            </Menu>
          </MenuPopover>
        </MenuTrigger>
      </Panel>

      <Panel position="bottom-center">
        <span className="text-xs">
          {visible} / {total} nodes
        </span>
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
  firstEgraph,
}: {
  egraph: string;
  outerElem: HTMLDivElement;
  innerElem: HTMLDivElement;
  aspectRatio: number;
  firstEgraph: string;
}) {
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});
  const [useInteractiveLayout, setUseInteractiveLayout] = useState(false);
  const [initialMaxNodes, setInitialMaxNodes] = useState(INITIAL_MAX_NODES);
  const [mergeEdges, setMergeEdges] = useState(false);
  const previousLayoutRef = useRef<PreviousLayout | null>(null);
  // e-class ID we have currently selected, store the first egraph string as well so we know if this selection is outdated,
  // if our whole list of egraphs changes, but keep the selection if we have simply added a new egraph on
  const [selectedNodeWithEGraph, setSelectedNodeWithEGraph] = useState<(SelectedNode & { firstEgraph: string }) | null>(null);
  const selectedNode = useMemo(() => {
    if (selectedNodeWithEGraph && selectedNodeWithEGraph.firstEgraph === firstEgraph) {
      return selectedNodeWithEGraph;
    }
    return null;
  }, [selectedNodeWithEGraph, firstEgraph]);
  const setSelectedNode = useCallback(
    (node: { type: "class" | "node"; id: string } | null) => {
      setSelectedNodeWithEGraph(node ? { ...node, firstEgraph } : null);
    },
    [setSelectedNodeWithEGraph, firstEgraph]
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
    queryKey: ["layout", egraph, getNodeSize, aspectRatio, selectedNode, previousLayout, mergeEdges, hiddenOverrides, initialMaxNodes],
    networkMode: "always",
    queryFn: ({ signal }) =>
      layoutGraph(egraph, getNodeSize, aspectRatio, selectedNode, previousLayout, mergeEdges, signal, hiddenOverrides, initialMaxNodes),
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

  const setHidden = useCallback(
    (id: string, hidden: boolean) => {
      setHiddenOverrides((prev) => ({ ...prev, [id]: hidden }));
    },
    [setHiddenOverrides]
  );

  if (layoutQuery.isError) {
    return <div className="p-4">Error: {layoutQuery.error.message}</div>;
  }
  if (layoutQuery.isPending) {
    return <Loading />;
  }

  const { nodes, edges, elkJSON, nodeToEdges, edgeToNodes, hiddenNodeStats } = layoutQuery.data;
  return (
    <>
      {layoutQuery.isFetching ? <Loading /> : <></>}
      <SetSelectedNodeContext.Provider value={setSelectedNode}>
        <SetHiddenContext.Provider value={setHidden}>
          <ReactFlowProvider>
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
              initialMaxNodes={initialMaxNodes}
              setInitialMaxNodes={setInitialMaxNodes}
              hiddenNodeStats={hiddenNodeStats}
            />
          </ReactFlowProvider>
        </SetHiddenContext.Provider>
      </SetSelectedNodeContext.Provider>
    </>
  );
}

function SelectSider({ length, onSelect, selected }: { length: number; onSelect: (index: number) => void; selected: number }) {
  return (
    <div className={`absolute top-0 left-0 p-4 z-50 backdrop-blur-sm ${length > 1 ? "" : "opacity-0"}`}>
      <Slider
        minValue={0}
        maxValue={length - 1}
        onChange={onSelect}
        value={selected}
        aria-label="Select which egraph to display from the history"
      >
        <div className="flex flex-1 items-end">
          <div className="flex flex-1 flex-col">
            <SliderOutput className="self-center">
              {({ state }) => {
                return (
                  <span className="text-sm">
                    {state.getThumbValueLabel(0)} / {length - 1}
                  </span>
                );
              }}
            </SliderOutput>
            <div className="flex flex-1 items-center gap-3">
              <SliderTack thumbLabels={["volume"]} />
            </div>
          </div>
        </div>
      </Slider>
    </div>
  );
}

export function Visualizer({ egraphs, height = null, resize = false }: { egraphs: string[]; height?: string | null; resize?: boolean }) {
  const [rootElem, setRootElem] = useState<HTMLDivElement | null>(null);

  const [outerElem, setOuterElem] = useState<HTMLDivElement | null>(null);
  const [innerElem, setInnerElem] = useState<HTMLDivElement | null>(null);
  const aspectRatio = rootElem ? rootElem.clientWidth / rootElem.clientHeight : null;

  // If we are at null, then use the last item in the list
  // if the last selection was for a list of egraphs that no longer exists, then use the last item in the list
  const [selected, setSelected] = useState<null | { egraphs: string[]; index: number }>(null);
  const actualSelected = selected && selected.egraphs === egraphs ? selected.index : egraphs.length - 1;
  const onSelect = useCallback(
    (index: number) => {
      setSelected({ egraphs, index });
    },
    [setSelected, egraphs]
  );

  return (
    <div className={`twp w-full relative ${resize ? "resize-y" : ""}`} style={{ height: height || "100%" }} ref={setRootElem}>
      {/* Hidden node to measure text size  */}
      <div className="invisible absolute">
        <ENode outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <SelectSider length={egraphs.length} onSelect={onSelect} selected={actualSelected} />
      {outerElem && innerElem && aspectRatio && (
        <LayoutFlow
          aspectRatio={aspectRatio}
          firstEgraph={egraphs[0]}
          egraph={egraphs[actualSelected]}
          outerElem={outerElem}
          innerElem={innerElem}
        />
      )}
    </div>
  );
}

// Put these both in one file, so its emitted as a single chunk and anywidget doesn't have to import another file

/// Render anywidget model to the given element
// Must be named `render` to work as an anywidget module
// https://anywidget.dev/en/afm/#lifecycle-methods
// eslint-disable-next-line react-refresh/only-export-components
export function render({ model, el }: { el: HTMLElement; model: AnyModel }) {
  // only render once with data, dont support updating widget yet
  const root = createRoot(el);
  // let callback: () => void;
  // const registerChangeEGraph = (setEgraph: (egraph: string) => void) => {
  // callback = () => setEgraph(model.get("egraph"));
  // model.on("change:egraph", callback);
  // };
  root.render(
    <QueryClientProvider client={queryClient}>
      <Visualizer egraphs={model.get("egraphs")} height="600px" resize />
    </QueryClientProvider>
  );

  return () => {
    // model.off("change:egraph", callback);
    root.unmount();
  };
}

/// Mount the visualizer to the given element
/// Call `render` to render a new list of egraphs
/// Call `unmount` to unmount the visualizer
// eslint-disable-next-line react-refresh/only-export-components
export function mount(element: HTMLElement): { render: (egraphs: string[]) => void; unmount: () => void } {
  const root = createRoot(element);
  function render(egraphs: string[]) {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Visualizer egraphs={egraphs} />
      </QueryClientProvider>
    );
  }

  function unmount() {
    root.unmount();
  }
  return { render, unmount };
}
