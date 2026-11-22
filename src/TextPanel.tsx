import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { EGraphClassID, EGraphNodeID, FilteredEGraph, SelectedNodes } from "./layout";
import { blocksToPlainText, formatEGraphBlocks, TextAlternative, TextClassBlock, TextSyntax } from "./text";
import { Button } from "./react-aria-components-tailwind-starter/src/button";
import { useCopyToClipboard } from "./react-aria-components-tailwind-starter/src/hooks/use-clipboard";
import { CopyIcon, XIcon } from "./react-aria-components-tailwind-starter/src/icons";

function hasTextSelection(): boolean {
  return (window.getSelection()?.toString() || "").length > 0;
}

function scrollElementIntoContainer(container: HTMLDivElement, el: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const margin = 8;
  if (eRect.top < cRect.top + margin) {
    container.scrollTo({
      top: container.scrollTop + (eRect.top - cRect.top) - margin,
      behavior: "smooth",
    });
  } else if (eRect.bottom > cRect.bottom - margin) {
    container.scrollTo({
      top: container.scrollTop + (eRect.bottom - cRect.bottom) + margin,
      behavior: "smooth",
    });
  }
}

function AlternativeExpr({
  alt,
  classID,
  isHighlighted,
  isFiltered,
  registerNodeRef,
  onSelectClass,
  onSelectNode,
  onFilterNode,
}: {
  alt: TextAlternative;
  classID: EGraphClassID;
  isHighlighted: boolean;
  isFiltered: boolean;
  registerNodeRef: (nodeID: EGraphNodeID, el: HTMLSpanElement | null) => void;
  onSelectClass: (classID: EGraphClassID) => void;
  onSelectNode: (nodeID: EGraphNodeID) => void;
  onFilterNode: (nodeID: EGraphNodeID) => void;
}) {
  const tooltip =
    alt.cost !== undefined
      ? `node: ${alt.nodeID} · class: ${classID} · cost: ${alt.cost}`
      : `node: ${alt.nodeID} · class: ${classID}`;
  const highlightClass = isFiltered
    ? "bg-indigo-50 ring-1 ring-indigo-600 rounded px-0.5"
    : isHighlighted
    ? "bg-indigo-100 ring-1 ring-indigo-300 rounded px-0.5"
    : "rounded px-0.5 hover:bg-indigo-50/70";
  return (
    <>
      <span
        ref={(el) => registerNodeRef(alt.nodeID, el)}
        title={tooltip}
        onClick={(e) => {
          if (hasTextSelection()) {
            return;
          }
          e.stopPropagation();
          onSelectNode(alt.nodeID);
        }}
        className={`cursor-pointer ${highlightClass} ${
          alt.subsumed ? "line-through text-gray-400" : "text-gray-900"
        }`}
      >
        {alt.parts.map((part, index) =>
          part.kind === "classRef" ? (
            <span
              key={index}
              title={`Jump to e-class <${part.classID}>`}
              onClick={(e) => {
                if (hasTextSelection()) {
                  return;
                }
                e.stopPropagation();
                onSelectClass(part.classID);
              }}
              className={`cursor-pointer hover:underline ${
                alt.subsumed ? "text-gray-400" : "text-blue-700"
              }`}
            >
              {`<${part.classID}>`}
            </span>
          ) : (
            <span key={index}>{part.value}</span>
          )
        )}
      </span>
      {(isFiltered || isHighlighted) && (
        <Button
          size="sm"
          variant="plain"
          isIconOnly
          onPress={() => onFilterNode(alt.nodeID)}
          aria-label={isFiltered ? `Unfilter e-node ${alt.nodeID}` : `Filter e-node ${alt.nodeID}`}
          className={`indent-0 inline-flex align-middle ml-0.5 size-4 sm:size-4 p-0 ${
            isFiltered ? "text-indigo-600" : "text-gray-400 hover:text-indigo-600"
          }`}
        >
          <span title={isFiltered ? `Unfilter node ${alt.nodeID}` : `Filter node ${alt.nodeID}`}>
            <FunnelIcon className="size-3" />
          </span>
        </Button>
      )}
    </>
  );
}

function ClassProduction({
  block,
  highlightedNodes,
  isClassFiltered,
  filteredNodes,
  registerClassRef,
  registerNodeRef,
  onSelectClass,
  onSelectNode,
  onFilterClass,
  onFilterNode,
}: {
  block: TextClassBlock;
  highlightedNodes: Set<string>;
  isClassFiltered: boolean;
  filteredNodes: Set<EGraphNodeID>;
  registerClassRef: (classID: EGraphClassID, el: HTMLDivElement | null) => void;
  registerNodeRef: (nodeID: EGraphNodeID, el: HTMLSpanElement | null) => void;
  onSelectClass: (classID: EGraphClassID) => void;
  onSelectNode: (nodeID: EGraphNodeID) => void;
  onFilterClass: (classID: EGraphClassID) => void;
  onFilterNode: (nodeID: EGraphNodeID) => void;
}) {
  const isClassHighlighted = highlightedNodes.has(`class-${block.classID}`);

  const filterButton =
    isClassFiltered || isClassHighlighted ? (
      <Button
        size="sm"
        variant="plain"
        isIconOnly
        onPress={() => onFilterClass(block.classID)}
        aria-label={isClassFiltered ? `Unfilter e-class ${block.classID}` : `Filter e-class ${block.classID}`}
        className={`indent-0 inline-flex align-middle ml-0.5 size-4 sm:size-4 p-0 ${
          isClassFiltered ? "text-indigo-600" : "text-gray-400 hover:text-indigo-600"
        }`}
      >
        <span title={isClassFiltered ? `Unfilter e-class <${block.classID}>` : `Filter e-class <${block.classID}>`}>
          <FunnelIcon className="size-3" />
        </span>
      </Button>
    ) : null;

  const lhsHeader = (
    <>
      <span
        title={`Select e-class <${block.classID}>`}
        onClick={(e) => {
          if (hasTextSelection()) {
            return;
          }
          e.stopPropagation();
          onSelectClass(block.classID);
        }}
        className={`cursor-pointer hover:underline text-blue-700 font-semibold ${
          isClassFiltered ? "bg-indigo-50 ring-1 ring-indigo-600 rounded px-0.5" : ""
        }`}
      >
        {`<${block.classID}>`}
      </span>
      {filterButton}
      {block.type && (
        <>
          <span className="text-gray-400"> : </span>
          <span className="text-gray-500">{block.type}</span>
        </>
      )}
      <span className="text-gray-400"> ::=</span>
    </>
  );

  const blockHighlightClass = isClassHighlighted ? "bg-indigo-50/80 ring-1 ring-indigo-300 rounded" : "";

  return (
    <div
      ref={(el) => registerClassRef(block.classID, el)}
      className={blockHighlightClass || undefined}
    >
      {block.metadataComments.map((comment, index) => (
        <div key={index} className="px-1 whitespace-pre-wrap break-words text-emerald-700">
          {comment}
        </div>
      ))}
      {block.multiline ? (
        <>
          <div className="pl-6 pr-1 -indent-5 whitespace-pre-wrap break-words rounded hover:bg-gray-50">
            {lhsHeader}
          </div>
          {block.alternatives.map((alt) => (
            <div
              key={alt.nodeID}
              className="pl-8 pr-1 -indent-7 whitespace-pre-wrap break-words rounded hover:bg-gray-50"
            >
              <span className="text-gray-400">{"  | "}</span>
              <AlternativeExpr
                alt={alt}
                classID={block.classID}
                isHighlighted={highlightedNodes.has(`node-${alt.nodeID}`)}
                isFiltered={filteredNodes.has(alt.nodeID)}
                registerNodeRef={registerNodeRef}
                onSelectClass={onSelectClass}
                onSelectNode={onSelectNode}
                onFilterNode={onFilterNode}
              />
              {alt.comment && <span className="text-emerald-700 pl-2">{alt.comment}</span>}
            </div>
          ))}
        </>
      ) : (
        <div className="pl-6 pr-1 -indent-5 whitespace-pre-wrap break-words rounded hover:bg-gray-50">
          {lhsHeader}
          <span className="text-gray-400"> </span>
          {block.alternatives.map((alt, index) => (
            <Fragment key={alt.nodeID}>
              {index > 0 && <span className="text-gray-400"> | </span>}
              <AlternativeExpr
                alt={alt}
                classID={block.classID}
                isHighlighted={highlightedNodes.has(`node-${alt.nodeID}`)}
                isFiltered={filteredNodes.has(alt.nodeID)}
                registerNodeRef={registerNodeRef}
                onSelectClass={onSelectClass}
                onSelectNode={onSelectNode}
                onFilterNode={onFilterNode}
              />
            </Fragment>
          ))}
          {block.alternatives.length === 1 && block.alternatives[0].comment && (
            <span className="text-emerald-700 pl-2">{block.alternatives[0].comment}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function TextPanel({
  subgraph,
  syntax = "call",
  selectedNodes,
  highlightedNodes,
  highlightScrollSeq,
  onSelectClass,
  onSelectNode,
  onClearSelection,
  onFilterClass,
  onFilterNode,
  onClose,
}: {
  subgraph: FilteredEGraph;
  syntax?: TextSyntax;
  selectedNodes: SelectedNodes;
  highlightedNodes: Set<string>;
  highlightScrollSeq: number;
  onSelectClass: (classID: EGraphClassID) => void;
  onSelectNode: (nodeID: EGraphNodeID) => void;
  onClearSelection: () => void;
  onFilterClass: (classID: EGraphClassID) => void;
  onFilterNode: (nodeID: EGraphNodeID) => void;
  onClose: () => void;
}) {
  const blocks = useMemo(() => formatEGraphBlocks(subgraph, syntax), [subgraph, syntax]);
  const plainText = useMemo(() => blocksToPlainText(blocks), [blocks]);
  const { filteredClasses, filteredNodes } = useMemo(() => {
    const classes = new Set<EGraphClassID>();
    const nodes = new Set<EGraphNodeID>();
    for (const selected of selectedNodes) {
      if (selected.type === "class") {
        classes.add(selected.id);
      } else {
        nodes.add(selected.id);
      }
    }
    return { filteredClasses: classes, filteredNodes: nodes };
  }, [selectedNodes]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const classRefs = useRef(new Map<EGraphClassID, HTMLDivElement>());
  const nodeRefs = useRef(new Map<EGraphNodeID, HTMLSpanElement>());
  const registerClassRef = useRef((classID: EGraphClassID, el: HTMLDivElement | null) => {
    if (el) {
      classRefs.current.set(classID, el);
    } else {
      classRefs.current.delete(classID);
    }
  }).current;
  const registerNodeRef = useRef((nodeID: EGraphNodeID, el: HTMLSpanElement | null) => {
    if (el) {
      nodeRefs.current.set(nodeID, el);
    } else {
      nodeRefs.current.delete(nodeID);
    }
  }).current;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    for (const flowID of highlightedNodes) {
      if (flowID.startsWith("node-")) {
        const el = nodeRefs.current.get(flowID.slice("node-".length));
        if (el) {
          scrollElementIntoContainer(container, el);
          return;
        }
      } else if (flowID.startsWith("class-")) {
        const el = classRefs.current.get(flowID.slice("class-".length));
        if (el) {
          scrollElementIntoContainer(container, el);
          return;
        }
      }
    }
  }, [highlightedNodes, highlightScrollSeq]);

  const clipboard = useCopyToClipboard();
  const handleCopyText = useCallback(() => clipboard.copy(plainText), [clipboard, plainText]);

  return (
    <div className="relative h-full w-full bg-white text-gray-900 select-text">
      <div className="absolute top-1.5 right-2 z-10 flex items-center gap-0.5 rounded bg-white/85 backdrop-blur-sm">
        <Button
          size="sm"
          variant="plain"
          isIconOnly
          onPress={handleCopyText}
          aria-label={clipboard.copied ? "Copied text" : "Copy text"}
          className="size-6 sm:size-6 p-0 text-gray-500 hover:text-gray-900"
        >
          <span title={clipboard.copied ? "Copied" : "Copy BNF text"}>
            <CopyIcon className="size-3.5" />
          </span>
        </Button>
        <Button
          size="sm"
          variant="plain"
          isIconOnly
          onPress={onClose}
          aria-label="Hide text view"
          className="size-6 sm:size-6 p-0 text-gray-500 hover:text-gray-900"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div
        ref={scrollContainerRef}
        onClick={(e) => {
          if (hasTextSelection() || (e.target as HTMLElement).closest("button")) {
            return;
          }
          onClearSelection();
        }}
        className="h-full overflow-auto px-3 py-2 pr-16 font-mono text-xs leading-5"
      >
        {blocks.length === 0 ? (
          <div className="text-gray-400 italic">Empty e-graph</div>
        ) : (
          blocks.map((block) => (
            <ClassProduction
              key={block.classID}
              block={block}
              highlightedNodes={highlightedNodes}
              isClassFiltered={filteredClasses.has(block.classID)}
              filteredNodes={filteredNodes}
              registerClassRef={registerClassRef}
              registerNodeRef={registerNodeRef}
              onSelectClass={onSelectClass}
              onSelectNode={onSelectNode}
              onFilterClass={onFilterClass}
              onFilterNode={onFilterNode}
            />
          ))
        )}
      </div>
    </div>
  );
}
