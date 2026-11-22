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
  CodeBracketIcon,
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
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";
import { AccessibleIcon } from "./react-aria-components-tailwind-starter/src/accessible-icon";
import { Button, ButtonGroup } from "./react-aria-components-tailwind-starter/src/button";
import { MinusIcon, PlusIcon } from "./react-aria-components-tailwind-starter/src/icons";
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
import { InlineLevel } from "./inline";
import { FilteredEGraph, FlowClass, FlowEdge, FlowNode, layoutGraph, PreviousLayout, SelectedNodes } from "./layout";
import { queryClient } from "./queryClient";
import { Loading } from "./Loading";
import { Slider, SliderOutput, SliderTack } from "./react-aria-components-tailwind-starter/src/slider";
import { TextPanel } from "./TextPanel";
import { blocksToPlainText, formatEGraphBlocks, TextSyntax } from "./text";

function EClassExtra({ extra }: { extra?: { [key: string]: string } }) {
  const entries = Object.entries(extra || {});
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="p-1 font-mono">
      {entries.map(([key, value]) => (
        <div key={key} className="truncate" title={`${key}: ${value}`} style={{ fontSize: 6 }}>
          {key != "" && <span className="pr-1 font-bold">{key}</span>}
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

export function EClassNode({ data, selected }: NodeProps<FlowClass>) {
  const border = data.selected ? "border-indigo-600" : "border-black";
  return (
    <div
      className={`rounded-md border-dotted ${border} h-full w-full ${selected ? "border-2" : "border"}`}
      style={{ backgroundColor: data.color! || "white" }}
      title={data.id}
    >
      <EClassExtra extra={data.extra} />
      <MyNodeToolbar type="class" id={data.id} selected={data.selected} />
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
  const selected = props?.data?.selected || false;
  const outline = subsumed && selected ? "outline-indigo-100" : subsumed ? "outline-gray-300" : selected ? "outline-indigo-600" : "outline-black";
  return (
    <div
      className={`p-1 rounded-md outline bg-white ${outline} h-full w-full ${
        props?.selected ? "outline-2" : "outline-1"
      }`}
      ref={props?.outerRef}
    >
      {props?.outerRef ? <></> : <MyNodeToolbar type="node" id={props!.data!.id} selected={selected} />}

      <div
        className={`font-mono text-base truncate max-w-96 min-w-6 text-center ${subsumed ? "text-gray-300" : ""}`}
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

export function MyNodeToolbar(node: { type: "class" | "node"; id: string, selected: boolean }) {
  const selectNode = useContext(SetSelectedNodeContext);
  const onClick = useCallback(() => selectNode!(node), [selectNode, node]);
  return (
    <NodeToolbar position={Position.Top}>
      <button
        onClick={onClick}
        className="rounded bg-white px-2 py-1 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        {node.selected ? "Unfilter" : "Filter"}
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
  subgraph,
  nodeToEdges,
  edgeToNodes,
  elkJSON,
  highlightedNodes,
  setHighlightedNodes,
  highlightedEdges,
  setHighlightedEdges,
  useInteractiveLayout,
  setUseInteractiveLayout,
  mergeEdges,
  setMergeEdges,
  showText,
  setShowText,
  textSyntax,
  setTextSyntax,
  inlineLevel,
  setInlineLevel,
  inlineInfo,
}: {
  nodes: (FlowNode | FlowClass)[];
  edges: FlowEdge[];
  subgraph: FilteredEGraph;
  nodeToEdges: Map<string, string[]>;
  edgeToNodes: Map<string, string[]>;
  elkJSON: string;
  highlightedNodes: Set<string>;
  setHighlightedNodes: (value: Set<string>) => void;
  highlightedEdges: Set<string>;
  setHighlightedEdges: (value: Set<string>) => void;
  useInteractiveLayout: boolean;
  setUseInteractiveLayout: (value: boolean) => void;
  mergeEdges: boolean;
  setMergeEdges: (value: boolean) => void;
  showText: boolean;
  setShowText: (value: boolean) => void;
  textSyntax: TextSyntax;
  setTextSyntax: (value: TextSyntax) => void;
  inlineLevel: InlineLevel;
  setInlineLevel: (value: InlineLevel) => void;
  inlineInfo: { appliedPasses: number; canInlineMore: boolean };
}) {
  // Trigger this when we want to skip the next fitView, for example when we change selection
  const skipNextFitRef = useRef(false);

  const nodes = useMemo(
    () => initialNodes.map((node) => ({ ...node, selected: highlightedNodes.has(node.id) })),
    [initialNodes, highlightedNodes]
  );
  const edges = useMemo(
    () => initialEdges.map((edge) => ({ ...edge, selected: highlightedEdges.has(edge.id) })),
    [initialEdges, highlightedEdges]
  );

  // Handle node/edge selection
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode | FlowClass>[]) => {
      const newSelectedNodes = processSelectionChanges(changes, highlightedNodes);
      if (newSelectedNodes) {
        const connectedEdges = [...newSelectedNodes].flatMap((node) => nodeToEdges.get(node) ?? []);
        setHighlightedNodes(newSelectedNodes);
        setHighlightedEdges(new Set(connectedEdges));
        skipNextFitRef.current = true;
      }
    },
    [highlightedNodes, setHighlightedNodes, nodeToEdges, setHighlightedEdges]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const newSelectedEdges = processSelectionChanges(changes, highlightedEdges);
      if (newSelectedEdges) {
        const connectedNodes = [...newSelectedEdges].flatMap((edge) => edgeToNodes.get(edge) ?? []);
        setHighlightedNodes(new Set(connectedNodes));
        setHighlightedEdges(newSelectedEdges);
        skipNextFitRef.current = true;
      }
    },
    [highlightedEdges, setHighlightedEdges, edgeToNodes, setHighlightedNodes]
  );

  const selectNode = useContext(SetSelectedNodeContext)!;
  const unselectNode = useCallback(() => selectNode(null), [selectNode]);

  // Re-fit when initial nodes/edges change or when toggling the text drawer
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

  const prevShowTextRef = useRef(showText);
  useEffect(() => {
    if (prevShowTextRef.current !== showText) {
      if (nodeInitialized) {
        const timer = window.setTimeout(() => {
          prevShowTextRef.current = showText;
          reactFlow.fitView({ padding: 0.1, duration: 250 });
        }, 50);
        return () => window.clearTimeout(timer);
      }
      prevShowTextRef.current = showText;
    }
  }, [showText, nodeInitialized, reactFlow]);

  const effectivePasses =
    inlineLevel === "max" ? inlineInfo.appliedPasses : Math.min(inlineLevel, inlineInfo.appliedPasses);
  const showInlineControls = inlineInfo.canInlineMore || effectivePasses > 0;
  const handleDecreaseInline = useCallback(
    () => setInlineLevel(Math.max(0, effectivePasses - 1)),
    [effectivePasses, setInlineLevel]
  );
  const handleIncreaseInline = useCallback(
    () => setInlineLevel(effectivePasses + 1),
    [effectivePasses, setInlineLevel]
  );
  const handleToggleMaxInline = useCallback(
    () => setInlineLevel(inlineLevel === "max" ? 0 : "max"),
    [inlineLevel, setInlineLevel]
  );

  const [isOpen, setOpen] = useState(false);
  const textClipboard = useCopyToClipboard();
  const jsonClipboard = useCopyToClipboard();
  const elkClipboard = useCopyToClipboard();
  const handleToggleShowText = useCallback(() => setShowText(!showText), [setShowText, showText]);
  const handleToggleTextSyntax = useCallback(
    () => setTextSyntax(textSyntax === "call" ? "sexpr" : "call"),
    [setTextSyntax, textSyntax]
  );
  const handleToggleInteractiveLayout = useCallback(
    () => setUseInteractiveLayout(!useInteractiveLayout),
    [setUseInteractiveLayout, useInteractiveLayout]
  );
  const handleToggleMergeEdges = useCallback(() => setMergeEdges(!mergeEdges), [setMergeEdges, mergeEdges]);
  const handleCopyText = useCallback(
    () => textClipboard.copy(blocksToPlainText(formatEGraphBlocks(subgraph, textSyntax))),
    [subgraph, textSyntax, textClipboard]
  );
  const handleCopyJson = useCallback(
    () => jsonClipboard.copy(JSON.stringify(subgraph.egraph, null, 2)),
    [subgraph.egraph, jsonClipboard]
  );
  const handleCopyElk = useCallback(() => elkClipboard.copy(elkJSON), [elkJSON, elkClipboard]);

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
      {subgraph.hasActiveFilter ? (
        <Panel position="top-center">
          <button
            className="rounded bg-white px-2 py-1 text-xs font-medium shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:shadow-md hover:ring-gray-400 transition-all duration-200"
            onClick={unselectNode}
          >
            Reset filter ({subgraph.classToNodes.size} classes)
          </button>
        </Panel>
      ) : (
        <></>
      )}
      <Panel position="top-right">
        <div className="flex items-center gap-2">
          {showInlineControls && (
            <div
              className="flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 text-xs text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 backdrop-blur-sm"
              title="Fold edge-reducing singleton e-classes (1 parent or ≤1 child) into parent labels"
            >
              <span className="font-medium text-gray-600">Inline</span>
              <span className="font-mono text-gray-900 min-w-[1ch] text-center">{effectivePasses}</span>
              <ButtonGroup>
                <Button
                  size="sm"
                  variant="outline"
                  isIconOnly
                  isDisabled={effectivePasses === 0}
                  onPress={handleDecreaseInline}
                  aria-label="Decrease inline level"
                  className="h-5 w-5 sm:h-5 sm:w-5 min-w-0 p-0"
                >
                  <MinusIcon className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  isIconOnly
                  isDisabled={!inlineInfo.canInlineMore}
                  onPress={handleIncreaseInline}
                  aria-label="Increase inline level"
                  className="h-5 w-5 sm:h-5 sm:w-5 min-w-0 p-0"
                >
                  <PlusIcon className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={inlineLevel !== "max" && !inlineInfo.canInlineMore}
                  onPress={handleToggleMaxInline}
                  aria-pressed={inlineLevel === "max"}
                  className={`h-5 sm:h-5 px-1.5 text-[11px] font-medium ${
                    inlineLevel === "max" ? "bg-gray-200 text-gray-900 hover:bg-gray-200" : ""
                  }`}
                >
                  Max
                </Button>
              </ButtonGroup>
            </div>
          )}
          <MenuTrigger>
            <MenuButton onPress={() => setOpen((prev) => !prev)} noIndicator variant="plain" isIconOnly>
              <AccessibleIcon aria-label="Open setting menu">
                <CogIcon className="size-6" />
              </AccessibleIcon>
            </MenuButton>
            <MenuPopover placement="bottom right" isOpen={isOpen} onOpenChange={setOpen}>
              <Menu>
                <MenuItem onAction={handleToggleShowText} className="cursor-pointer">
                  <AccessibleIcon>
                    <CodeBracketIcon />
                  </AccessibleIcon>
                  <MenuItemLabel>Text view</MenuItemLabel>
                  <MenuItemDescription>
                    {showText ? "Hide synchronized BNF text view" : "Show synchronized BNF text view below graph"}
                  </MenuItemDescription>
                </MenuItem>
                <MenuItem onAction={handleToggleTextSyntax} className="cursor-pointer">
                  <AccessibleIcon>
                    <CodeBracketIcon />
                  </AccessibleIcon>
                  <MenuItemLabel>Syntax: {textSyntax === "sexpr" ? "S-expr" : "Call"}</MenuItemLabel>
                  <MenuItemDescription>
                    {textSyntax === "sexpr" ? "(op a b) · switch to Call op(a, b)" : "op(a, b) · switch to S-expr (op a b)"}
                  </MenuItemDescription>
                </MenuItem>
                <MenuSeparator />
                <MenuItem onAction={handleToggleInteractiveLayout} className="cursor-pointer">
                  <AccessibleIcon>{useInteractiveLayout ? <ArrowUturnRightIcon /> : <ArrowLongRightIcon />}</AccessibleIcon>
                  <MenuItemLabel>Interactive layout</MenuItemLabel>
                  <MenuItemDescription>
                    {useInteractiveLayout ? "Layout independently of previous positions" : "Layout interactively based on previous positions"}
                  </MenuItemDescription>
                </MenuItem>
                <MenuItem onAction={handleToggleMergeEdges} className="cursor-pointer">
                  <AccessibleIcon>{mergeEdges ? <ChevronRightIcon /> : <Bars2Icon />}</AccessibleIcon>
                  <MenuItemLabel>Merge edges</MenuItemLabel>
                  <MenuItemDescription>{mergeEdges ? "Seperate ports for incoming edges" : "Merge all incoming edges"}</MenuItemDescription>
                </MenuItem>
                <MenuSeparator />
                <MenuItem onAction={handleCopyText} className="cursor-pointer">
                  <AccessibleIcon>
                    <ClipboardDocumentListIcon />
                  </AccessibleIcon>
                  <MenuItemLabel>Copy text</MenuItemLabel>
                  <MenuItemDescription>
                    {textClipboard.copied
                      ? "Copied BNF text to clipboard"
                      : textClipboard.error
                      ? `Failed to copy text to clipboard ${textClipboard.error.message}`
                      : "Copy BNF text to clipboard"}
                  </MenuItemDescription>
                </MenuItem>
                <MenuItem onAction={handleCopyJson} className="cursor-pointer">
                  <AccessibleIcon>
                    <ClipboardDocumentListIcon />
                  </AccessibleIcon>
                  <MenuItemLabel>Copy JSON</MenuItemLabel>
                  <MenuItemDescription>
                    {jsonClipboard.copied
                      ? "Copied e-graph JSON to clipboard"
                      : jsonClipboard.error
                      ? `Failed to copy e-graph JSON to clipboard ${jsonClipboard.error.message}`
                      : "Copy e-graph JSON to clipboard"}
                  </MenuItemDescription>
                </MenuItem>
                <MenuItem onAction={handleCopyElk} className="cursor-pointer">
                  <AccessibleIcon>
                    <ClipboardDocumentListIcon />
                  </AccessibleIcon>
                  <MenuItemLabel>Copy ELK</MenuItemLabel>
                  <MenuItemDescription>
                    {elkClipboard.copied
                      ? "Copied ELK JSON to clipboard"
                      : elkClipboard.error
                      ? `Failed to copy ELK JSON to clipboard ${elkClipboard.error.message}`
                      : "Copy ELK JSON to clipboard"}
                  </MenuItemDescription>
                </MenuItem>
              </Menu>
            </MenuPopover>
          </MenuTrigger>
        </div>
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
  extraElem,
  aspectRatio,
  firstEgraph,
  showText,
  setShowText,
  textSyntax,
  setTextSyntax,
  inlineLevel,
  setInlineLevel,
}: {
  egraph: string;
  outerElem: HTMLDivElement;
  innerElem: HTMLDivElement;
  extraElem: HTMLDivElement;
  aspectRatio: number;
  firstEgraph: string;
  showText: boolean;
  setShowText: (value: boolean) => void;
  textSyntax: TextSyntax;
  setTextSyntax: (value: TextSyntax) => void;
  inlineLevel: InlineLevel;
  setInlineLevel: (value: InlineLevel) => void;
}) {
  const [useInteractiveLayout, setUseInteractiveLayout] = useState(false);
  const [mergeEdges, setMergeEdges] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());
  const [highlightScrollSeq, setHighlightScrollSeq] = useState(0);
  const previousLayoutRef = useRef<PreviousLayout | null>(null);
  const nodeToClassRef = useRef<Map<string, string> | null>(null);
  // e-class ID we have currently selected, store the first egraph string as well so we know if this selection is outdated,
  // if our whole list of egraphs changes, but keep the selection if we have simply added a new egraph on
  const [selectedNodesWithEGraph, setSelectedNodesWithEGraph] = useState<{selected: SelectedNodes, firstEgraph: string }>({selected: [], firstEgraph});
  const selectedNodes = useMemo(() => {
    if (selectedNodesWithEGraph && selectedNodesWithEGraph.firstEgraph === firstEgraph) {
      return selectedNodesWithEGraph.selected;
    }
    return [];
  }, [selectedNodesWithEGraph, firstEgraph]);
  // Callback to toggle whether the given node is selected
  // if node is null, clear selection
  const toggleSelectedNode = useCallback(
    (node: { type: "class" | "node"; id: string } | null) => {
      if (!node) {
        setSelectedNodesWithEGraph({ selected: [], firstEgraph });
        return;
      }
      // If the e-graph has changed, reset selection
      setSelectedNodesWithEGraph((prev) => {
        if (prev.firstEgraph !== firstEgraph) {
          return { selected: [node], firstEgraph };
        }
        const newSelected = [...prev.selected];
        const index = newSelected.findIndex((n) => n.type === node.type && n.id === node.id);
        if (index >= 0) {
          newSelected.splice(index, 1);
        } else {
          const nodeToClass = nodeToClassRef.current;
          if (nodeToClass) {
            if (node.type === "node") {
              // Refining an e-class filter to one of its e-nodes replaces the redundant class filter
              const owningClass = nodeToClass.get(node.id);
              if (owningClass !== undefined) {
                for (let i = newSelected.length - 1; i >= 0; i--) {
                  if (newSelected[i].type === "class" && newSelected[i].id === owningClass) {
                    newSelected.splice(i, 1);
                  }
                }
              }
            } else {
              // Widening to a whole e-class clears any per-node filters inside that e-class
              for (let i = newSelected.length - 1; i >= 0; i--) {
                if (newSelected[i].type === "node" && nodeToClass.get(newSelected[i].id) === node.id) {
                  newSelected.splice(i, 1);
                }
              }
            }
          }
          newSelected.push(node);
        }
        return { selected: newSelected, firstEgraph };
      });
    },
    [setSelectedNodesWithEGraph, firstEgraph]
  );

  const extraSizeCacheRef = useRef(new Map<string, { width: number; height: number }>());
  const [extraMeasure, setExtraMeasure] = useState<{ container: HTMLDivElement; root: Root } | null>(null);
  useEffect(() => {
    const cache = extraSizeCacheRef.current;
    cache.clear();
    const container = document.createElement("div");
    container.className = "w-max max-w-96";
    extraElem.replaceChildren(container);
    const root = createRoot(container);
    setExtraMeasure({ container, root });
    return () => {
      cache.clear();
      setExtraMeasure(null);
      container.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [extraElem]);

  const getNodeSize = useCallback(
    (contents: string) => {
      innerElem.innerText = contents;
      return outerElem.getBoundingClientRect();
    },
    [outerElem, innerElem]
  );
  const getExtraSize = useCallback(
    (extra: { [key: string]: string }) => {
      if (!extraMeasure || Object.keys(extra).length === 0) {
        return { width: 0, height: 0 };
      }
      const key = JSON.stringify(extra);
      const cached = extraSizeCacheRef.current.get(key);
      if (cached) {
        return cached;
      }
      flushSync(() => {
        extraMeasure.root.render(<EClassExtra extra={extra} />);
      });
      const rect = extraMeasure.container.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      if (size.width > 0 || size.height > 0) {
        extraSizeCacheRef.current.set(key, size);
      }
      return size;
    },
    [extraMeasure]
  );
  const previousLayout = useInteractiveLayout ? previousLayoutRef.current : null;
  const effectiveInlineSyntax: TextSyntax = inlineLevel === 0 ? "call" : textSyntax;
  const layoutQuery = useQuery({
    queryKey: [
      "layout",
      egraph,
      getNodeSize,
      getExtraSize,
      aspectRatio,
      selectedNodes,
      previousLayout,
      mergeEdges,
      inlineLevel,
      effectiveInlineSyntax,
    ],
    enabled: Boolean(extraMeasure),
    networkMode: "always",
    queryFn: ({ signal }) =>
      layoutGraph(
        egraph,
        getNodeSize,
        getExtraSize,
        aspectRatio,
        selectedNodes,
        previousLayout,
        mergeEdges,
        inlineLevel,
        effectiveInlineSyntax,
        signal
      ),
    staleTime: Infinity,
    retry: false,
    retryOnMount: false,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (layoutQuery.status === "success") {
      previousLayoutRef.current = layoutQuery.data.layout;
      nodeToClassRef.current = layoutQuery.data.subgraph.nodeToClass;
    }
  }, [layoutQuery.status, layoutQuery.data]);

  const handleSelectFlowNode = useCallback(
    (flowID: string) => {
      const connectedEdges = layoutQuery.data?.nodeToEdges.get(flowID) ?? [];
      setHighlightedNodes(new Set([flowID]));
      setHighlightedEdges(new Set(connectedEdges));
      setHighlightScrollSeq((seq) => seq + 1);
    },
    [layoutQuery.data]
  );
  const handleSelectClass = useCallback(
    (classID: string) => {
      handleSelectFlowNode(`class-${classID}`);
    },
    [handleSelectFlowNode]
  );
  const handleSelectNode = useCallback(
    (nodeID: string) => {
      handleSelectFlowNode(`node-${nodeID}`);
    },
    [handleSelectFlowNode]
  );
  const handleClearSelection = useCallback(() => {
    setHighlightedNodes((prev) => (prev.size === 0 ? prev : new Set()));
    setHighlightedEdges((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  const handleFilterClass = useCallback(
    (classID: string) => {
      toggleSelectedNode({ type: "class", id: classID });
    },
    [toggleSelectedNode]
  );
  const handleFilterNode = useCallback(
    (nodeID: string) => {
      toggleSelectedNode({ type: "node", id: nodeID });
    },
    [toggleSelectedNode]
  );
  const handleCloseText = useCallback(() => setShowText(false), [setShowText]);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [textHeightRatio, setTextHeightRatio] = useState(0.38);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  const handleSplitPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const container = splitContainerRef.current;
    if (!container) {
      return;
    }
    e.preventDefault();
    resizeCleanupRef.current?.();
    setIsResizingSplit(true);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const updateRatio = (clientY: number) => {
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const rawRatio = (rect.bottom - clientY) / rect.height;
      setTextHeightRatio(Math.min(0.75, Math.max(0.15, rawRatio)));
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateRatio(moveEvent.clientY);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      setIsResizingSplit(false);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    updateRatio(e.clientY);
  }, []);

  const handleSplitDoubleClick = useCallback(() => {
    setTextHeightRatio(0.38);
  }, []);

  const handleSplitKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setTextHeightRatio((r) => Math.min(0.75, Math.round((r + 0.05) * 100) / 100));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setTextHeightRatio((r) => Math.max(0.15, Math.round((r - 0.05) * 100) / 100));
    } else if (e.key === "Home") {
      e.preventDefault();
      setTextHeightRatio(0.38);
    }
  }, []);

  if (layoutQuery.isError) {
    return <div className="p-4">Error: {layoutQuery.error.message}</div>;
  }
  if (layoutQuery.isPending) {
    return <Loading />;
  }

  const { nodes, edges, elkJSON, nodeToEdges, edgeToNodes, subgraph, inlineInfo } = layoutQuery.data;

  return (
    <div ref={splitContainerRef} className="flex flex-col h-full w-full">
      <div className="flex-1 min-h-0 relative">
        {layoutQuery.isFetching ? <Loading /> : <></>}
        <SetSelectedNodeContext.Provider value={toggleSelectedNode}>
          <ReactFlowProvider>
            <Rendering
              nodes={nodes}
              edges={edges}
              subgraph={subgraph}
              nodeToEdges={nodeToEdges}
              edgeToNodes={edgeToNodes}
              elkJSON={elkJSON}
              highlightedNodes={highlightedNodes}
              setHighlightedNodes={setHighlightedNodes}
              highlightedEdges={highlightedEdges}
              setHighlightedEdges={setHighlightedEdges}
              useInteractiveLayout={useInteractiveLayout}
              setUseInteractiveLayout={setUseInteractiveLayout}
              mergeEdges={mergeEdges}
              setMergeEdges={setMergeEdges}
              showText={showText}
              setShowText={setShowText}
              textSyntax={textSyntax}
              setTextSyntax={setTextSyntax}
              inlineLevel={inlineLevel}
              setInlineLevel={setInlineLevel}
              inlineInfo={inlineInfo}
            />
          </ReactFlowProvider>
        </SetSelectedNodeContext.Provider>
      </div>
      {showText && (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize graph and text view"
            aria-valuemin={15}
            aria-valuemax={75}
            aria-valuenow={Math.round(textHeightRatio * 100)}
            tabIndex={0}
            title="Drag to resize · Double-click to reset"
            onPointerDown={handleSplitPointerDown}
            onDoubleClick={handleSplitDoubleClick}
            onKeyDown={handleSplitKeyDown}
            className={`group relative h-2 shrink-0 cursor-row-resize select-none touch-none border-t border-gray-200 flex items-center justify-center transition-colors ${
              isResizingSplit ? "bg-indigo-50 border-indigo-300" : "bg-gray-50/70 hover:bg-gray-100"
            }`}
          >
            <div
              className={`h-0.5 w-8 rounded-full transition-colors ${
                isResizingSplit ? "bg-indigo-500" : "bg-gray-300 group-hover:bg-gray-500"
              }`}
            />
          </div>
          <div
            className="shrink-0 min-h-[80px] bg-white overflow-hidden"
            style={{ height: `${(textHeightRatio * 100).toFixed(2)}%` }}
          >
            <TextPanel
              subgraph={subgraph}
              syntax={textSyntax}
              selectedNodes={selectedNodes}
              highlightedNodes={highlightedNodes}
              highlightScrollSeq={highlightScrollSeq}
              onSelectClass={handleSelectClass}
              onSelectNode={handleSelectNode}
              onClearSelection={handleClearSelection}
              onFilterClass={handleFilterClass}
              onFilterNode={handleFilterNode}
              onClose={handleCloseText}
            />
          </div>
        </>
      )}
    </div>
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

export type MountOptions = {
  showText?: boolean;
  textSyntax?: TextSyntax;
  inlineLevel?: InlineLevel;
};

export function Visualizer({
  egraphs,
  height = null,
  resize = false,
  showText: initialShowText = false,
  textSyntax: initialTextSyntax = "call",
  inlineLevel: initialInlineLevel = 0,
}: {
  egraphs: string[];
  height?: string | null;
  resize?: boolean;
  showText?: boolean;
  textSyntax?: TextSyntax;
  inlineLevel?: InlineLevel;
}) {
  const [rootElem, setRootElem] = useState<HTMLDivElement | null>(null);

  const [outerElem, setOuterElem] = useState<HTMLDivElement | null>(null);
  const [innerElem, setInnerElem] = useState<HTMLDivElement | null>(null);
  const [extraElem, setExtraElem] = useState<HTMLDivElement | null>(null);
  const [showText, setShowText] = useState(initialShowText);
  const [textSyntax, setTextSyntax] = useState<TextSyntax>(initialTextSyntax);
  const [inlineLevel, setInlineLevel] = useState<InlineLevel>(initialInlineLevel);
  const aspectRatio = rootElem ? rootElem.clientWidth / rootElem.clientHeight : null;

  useEffect(() => {
    setShowText(initialShowText);
  }, [initialShowText]);

  useEffect(() => {
    setTextSyntax(initialTextSyntax);
  }, [initialTextSyntax]);

  useEffect(() => {
    setInlineLevel(initialInlineLevel);
  }, [initialInlineLevel]);

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
      {/* Hidden elements to measure node and extra class_data sizes independently */}
      <div className="invisible absolute">
        <ENode outerRef={setOuterElem} innerRef={setInnerElem} />
      </div>
      <div className="invisible absolute" ref={setExtraElem} />
      <SelectSider length={egraphs.length} onSelect={onSelect} selected={actualSelected} />
      {outerElem && innerElem && extraElem && aspectRatio && (
        <LayoutFlow
          aspectRatio={aspectRatio}
          firstEgraph={egraphs[0]}
          egraph={egraphs[actualSelected]}
          outerElem={outerElem}
          innerElem={innerElem}
          extraElem={extraElem}
          showText={showText}
          setShowText={setShowText}
          textSyntax={textSyntax}
          setTextSyntax={setTextSyntax}
          inlineLevel={inlineLevel}
          setInlineLevel={setInlineLevel}
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
      <Visualizer
        egraphs={model.get("egraphs")}
        showText={model.get("show_text")}
        textSyntax={model.get("text_syntax")}
        inlineLevel={model.get("inline_level")}
        height="600px"
        resize
      />
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
export function mount(
  element: HTMLElement,
  options?: MountOptions
): { render: (egraphs: string[], renderOptions?: MountOptions) => void; unmount: () => void } {
  const root = createRoot(element);
  function render(egraphs: string[], renderOptions?: MountOptions) {
    const merged = { ...options, ...renderOptions };
    root.render(
      <QueryClientProvider client={queryClient}>
        <Visualizer
          egraphs={egraphs}
          showText={merged.showText}
          textSyntax={merged.textSyntax}
          inlineLevel={merged.inlineLevel}
        />
      </QueryClientProvider>
    );
  }

  function unmount() {
    root.unmount();
  }
  return { render, unmount };
}
