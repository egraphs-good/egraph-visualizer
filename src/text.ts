import { EGraphClassData, EGraphClassID, EGraphNode, EGraphNodeID, FilteredEGraph } from "./layout";

// Matches MISSING_ARG_VALUE in egraph-serialize when formatting already-inlined e-graphs:
// https://github.com/egraphs-good/egraph-serialize/blob/main/src/algorithms.rs
export const MISSING_ARG_VALUE = "·";

export type TextSyntax = "call" | "sexpr";

export type TextExprPart =
  | { kind: "text"; value: string }
  | { kind: "classRef"; classID: EGraphClassID };

export type TextAlternative = {
  nodeID: EGraphNodeID;
  expr: string;
  parts: TextExprPart[];
  referencedClasses: EGraphClassID[];
  cost?: number;
  comment?: string;
  subsumed?: boolean;
};

export type TextGroupHeader = {
  level: number;
  key: string;
  value: string;
  line: string;
};

export type TextClassBlock = {
  classID: EGraphClassID;
  type?: string;
  groupHeaders?: TextGroupHeader[];
  hasGroupBreak?: boolean;
  metadataComments: string[];
  alternatives: TextAlternative[];
  multiline: boolean;
};

function formatClassRef(classID: EGraphClassID): string {
  return `<${classID}>`;
}

function buildOpParts<T>(
  op: string,
  args: T[],
  syntax: TextSyntax,
  onArg: (arg: T) => TextExprPart
): TextExprPart[] {
  const parts: TextExprPart[] = [];
  const pushText = (value: string) => {
    if (value) {
      parts.push({ kind: "text", value });
    }
  };

  if (args.length === 0) {
    pushText(op);
    return parts;
  }

  const segments = op.split(MISSING_ARG_VALUE);
  const dots = segments.length - 1;
  if (dots > 0) {
    if (dots >= args.length) {
      // Exact match (dots === args.length) or extra leading literal dots (e.g. `·.fold_boolean(·, FALSE, ·)`
      // produced by upstream inline_leaves on a `·.method` op): fill the last `args.length` placeholders.
      const literalPrefixDots = dots - args.length;
      pushText(segments[0]);
      for (let i = 0; i < dots; i++) {
        if (i < literalPrefixDots) {
          pushText(MISSING_ARG_VALUE);
        } else {
          parts.push(onArg(args[i - literalPrefixDots]));
        }
        pushText(segments[i + 1]);
      }
      return parts;
    }

    // Fewer placeholders than args (e.g. `·.select` with `[self, arg1]`): fill the placeholders
    // with the first `dots` args, then call that expression with the remaining args.
    const calleeParts: TextExprPart[] = [];
    if (segments[0]) {
      calleeParts.push({ kind: "text", value: segments[0] });
    }
    for (let i = 0; i < dots; i++) {
      calleeParts.push(onArg(args[i]));
      if (segments[i + 1]) {
        calleeParts.push({ kind: "text", value: segments[i + 1] });
      }
    }
    const rest = args.slice(dots);
    if (syntax === "sexpr") {
      parts.push({ kind: "text", value: "(" }, ...calleeParts);
      for (const arg of rest) {
        parts.push({ kind: "text", value: " " }, onArg(arg));
      }
      parts.push({ kind: "text", value: ")" });
      return parts;
    }

    parts.push(...calleeParts, { kind: "text", value: "(" });
    for (let i = 0; i < rest.length; i++) {
      if (i > 0) {
        parts.push({ kind: "text", value: ", " });
      }
      parts.push(onArg(rest[i]));
    }
    parts.push({ kind: "text", value: ")" });
    return parts;
  }

  if (syntax === "sexpr") {
    parts.push({ kind: "text", value: `(${op} ` });
    for (let i = 0; i < args.length; i++) {
      if (i > 0) {
        parts.push({ kind: "text", value: " " });
      }
      parts.push(onArg(args[i]));
    }
    parts.push({ kind: "text", value: ")" });
    return parts;
  }

  parts.push({ kind: "text", value: `${op}(` });
  for (let i = 0; i < args.length; i++) {
    if (i > 0) {
      parts.push({ kind: "text", value: ", " });
    }
    parts.push(onArg(args[i]));
  }
  parts.push({ kind: "text", value: ")" });
  return parts;
}

function partsToText(parts: TextExprPart[]): string {
  return parts
    .map((part) => (part.kind === "classRef" ? formatClassRef(part.classID) : part.value))
    .join("");
}

export function formatOpArgs(
  op: string,
  args: string[],
  syntax: TextSyntax = "call"
): string {
  return partsToText(buildOpParts(op, args, syntax, (value) => ({ kind: "text", value })));
}

function formatNodeExpr(
  node: EGraphNode,
  nodeToClass: Map<EGraphNodeID, EGraphClassID>,
  syntax: TextSyntax
): { expr: string; parts: TextExprPart[]; referencedClasses: EGraphClassID[] } {
  const childIDs = node.children || [];
  const referencedClasses: EGraphClassID[] = [];
  const parts = buildOpParts(node.op, childIDs, syntax, (childID) => {
    const classID = nodeToClass.get(childID);
    if (classID !== undefined) {
      referencedClasses.push(classID);
      return { kind: "classRef", classID };
    }
    return { kind: "text", value: `?${childID}` };
  });
  return {
    expr: partsToText(parts),
    parts,
    referencedClasses,
  };
}

function formatClassMetadataComments(
  classData: EGraphClassData | undefined,
  isRoot: boolean,
  excludedKeys?: ReadonlySet<string>
): string[] {
  const comments: string[] = [];
  if (isRoot) {
    comments.push("# [root]");
  }
  if (classData) {
    for (const [key, value] of Object.entries(classData)) {
      if (key === "type" || value === undefined || excludedKeys?.has(key)) {
        continue;
      }
      const raw = key === "" ? value : `${key}: ${value}`;
      for (const line of raw.split(/\r?\n/)) {
        comments.push(`# ${line}`);
      }
    }
  }
  return comments;
}

function compareGroupValues(a: string, b: string): number {
  const aTrim = a.trim();
  const bTrim = b.trim();
  const aNum = aTrim !== "" ? Number(aTrim) : NaN;
  const bNum = bTrim !== "" ? Number(bTrim) : NaN;
  const aIsNum = Number.isFinite(aNum);
  const bIsNum = Number.isFinite(bNum);
  if (aIsNum && bIsNum && aNum !== bNum) {
    return aNum - bNum;
  }
  if (aIsNum !== bIsNum) {
    return aIsNum ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Automatically detect hierarchical grouping keys from `class_data` in first-seen JSON key order.
 * A key qualifies iff it is non-`type`, non-empty, single-line, present on every displayed class,
 * repeats at least once, and greedily keeps the bucket count strictly below the class count.
 */
function detectGroupKeys(
  orderedClasses: EGraphClassID[],
  classData?: { [id: EGraphClassID]: EGraphClassData }
): string[] {
  if (!classData || orderedClasses.length <= 1) {
    return [];
  }
  const keyOrder: string[] = [];
  const seenKeys = new Set<string>();
  for (const classID of orderedClasses) {
    const data = classData[classID];
    if (!data) {
      continue;
    }
    for (const [key, value] of Object.entries(data)) {
      if (key === "type" || key === "" || value === undefined || seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      keyOrder.push(key);
    }
  }

  const groupKeys: string[] = [];
  for (const key of keyOrder) {
    let allPresent = true;
    const distinct = new Set<string>();
    for (const classID of orderedClasses) {
      const val = classData[classID]?.[key];
      if (val === undefined || /[\r\n]/.test(val)) {
        allPresent = false;
        break;
      }
      distinct.add(val);
    }
    if (!allPresent || distinct.size >= orderedClasses.length) {
      continue;
    }
    const candidate = [...groupKeys, key];
    const buckets = new Set<string>();
    for (const classID of orderedClasses) {
      buckets.add(JSON.stringify(candidate.map((k) => classData[classID]![k])));
    }
    if (buckets.size < orderedClasses.length) {
      groupKeys.push(key);
    }
  }
  return groupKeys;
}

function formatNodeComment(node: EGraphNode): string | undefined {
  return node.subsumed ? "# [subsumed]" : undefined;
}

function orderClassesDFS(subgraph: FilteredEGraph): EGraphClassID[] {
  const { egraph, classToNodes, nodeToClass } = subgraph;
  const visited = new Set<EGraphClassID>();
  const order: EGraphClassID[] = [];

  const visit = (startClass: EGraphClassID) => {
    const stack: EGraphClassID[] = [startClass];
    while (stack.length > 0) {
      const classID = stack.pop()!;
      if (visited.has(classID) || !classToNodes.has(classID)) {
        continue;
      }
      visited.add(classID);
      order.push(classID);

      const childClasses: EGraphClassID[] = [];
      for (const [, node] of classToNodes.get(classID)!) {
        for (const childID of node.children || []) {
          const childClass = nodeToClass.get(childID);
          if (childClass !== undefined && !visited.has(childClass)) {
            childClasses.push(childClass);
          }
        }
      }
      for (let i = childClasses.length - 1; i >= 0; i--) {
        stack.push(childClasses[i]);
      }
    }
  };

  for (const rootClass of egraph.root_eclasses || []) {
    if (classToNodes.has(rootClass)) {
      visit(rootClass);
    }
  }
  for (const classID of classToNodes.keys()) {
    visit(classID);
  }
  return order;
}

export function formatEGraphBlocks(
  subgraph: FilteredEGraph,
  syntax: TextSyntax = "call"
): TextClassBlock[] {
  const { egraph, classToNodes, nodeToClass } = subgraph;
  const rootSet = new Set(egraph.root_eclasses || []);
  const orderedClasses = orderClassesDFS(subgraph).filter(
    (classID) => (classToNodes.get(classID)?.length ?? 0) > 0
  );
  const groupKeys = detectGroupKeys(orderedClasses, egraph.class_data);
  const excludedKeys = groupKeys.length > 0 ? new Set(groupKeys) : undefined;
  const blocks: TextClassBlock[] = [];

  const pushClassBlock = (
    classID: EGraphClassID,
    groupHeaders?: TextGroupHeader[],
    hasGroupBreak?: boolean
  ) => {
    const entries = classToNodes.get(classID) || [];
    if (entries.length === 0) {
      return;
    }
    const classData = egraph.class_data?.[classID];
    const isRoot = rootSet.has(classID);
    const metadataComments = formatClassMetadataComments(classData, isRoot, excludedKeys);

    const alternatives: TextAlternative[] = entries.map(([nodeID, node]) => {
      const { expr, parts, referencedClasses } = formatNodeExpr(node, nodeToClass, syntax);
      const comment = formatNodeComment(node);
      return {
        nodeID,
        expr,
        parts,
        referencedClasses,
        ...(node.cost !== undefined ? { cost: node.cost } : {}),
        ...(comment ? { comment } : {}),
        ...(node.subsumed ? { subsumed: true } : {}),
      };
    });

    const multiline = alternatives.length > 1 && alternatives.some((alt) => alt.comment !== undefined);
    blocks.push({
      classID,
      ...(classData?.type ? { type: classData.type } : {}),
      ...(groupHeaders && groupHeaders.length > 0 ? { groupHeaders } : {}),
      ...(hasGroupBreak ? { hasGroupBreak: true } : {}),
      metadataComments,
      alternatives,
      multiline,
    });
  };

  if (groupKeys.length === 0) {
    for (const classID of orderedClasses) {
      pushClassBlock(classID);
    }
    return blocks;
  }

  // Hash count counts outward from the class (nesting level from the class, not a fixed key
  // identity): `#` is a single class, `##` is the innermost group, `###` is the next enclosing
  // group, etc.
  const emitGroupLevel = (
    classes: EGraphClassID[],
    levelIdx: number,
    pendingHeaders: TextGroupHeader[],
    pendingBreak: boolean
  ) => {
    if (levelIdx >= groupKeys.length) {
      classes.forEach((classID, idx) => {
        pushClassBlock(
          classID,
          idx === 0 ? pendingHeaders : undefined,
          idx === 0 ? pendingBreak : false
        );
      });
      return;
    }
    const key = groupKeys[levelIdx];
    const buckets = new Map<string, EGraphClassID[]>();
    for (const classID of classes) {
      const val = egraph.class_data![classID]![key]!;
      let list = buckets.get(val);
      if (!list) {
        list = [];
        buckets.set(val, list);
      }
      list.push(classID);
    }
    const sortedValues = [...buckets.keys()].sort(compareGroupValues);
    const hashCount = groupKeys.length - levelIdx + 1;
    const prefix = "#".repeat(hashCount);
    sortedValues.forEach((value, idx) => {
      const header: TextGroupHeader = {
        level: hashCount,
        key,
        value,
        line: `${prefix} ${key}: ${value}`,
      };
      const nextHeaders = idx === 0 ? [...pendingHeaders, header] : [header];
      const nextBreak = levelIdx === 0 ? idx > 0 : idx === 0 ? pendingBreak : false;
      emitGroupLevel(buckets.get(value)!, levelIdx + 1, nextHeaders, nextBreak);
    });
  };

  emitGroupLevel(orderedClasses, 0, [], false);
  return blocks;
}

export function blocksToPlainText(blocks: TextClassBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.alternatives.length === 0) {
      continue;
    }
    if (block.hasGroupBreak) {
      lines.push("");
    }
    if (block.groupHeaders) {
      for (const header of block.groupHeaders) {
        lines.push(header.line);
      }
    }
    for (const comment of block.metadataComments) {
      lines.push(comment);
    }
    const header = block.type
      ? `${formatClassRef(block.classID)} : ${block.type} ::=`
      : `${formatClassRef(block.classID)} ::=`;

    if (block.multiline) {
      lines.push(header);
      for (const alt of block.alternatives) {
        lines.push(alt.comment ? `  | ${alt.expr}  ${alt.comment}` : `  | ${alt.expr}`);
      }
    } else {
      const rhs = block.alternatives.map((alt) => alt.expr).join(" | ");
      const singleComment = block.alternatives.length === 1 ? block.alternatives[0].comment : undefined;
      lines.push(singleComment ? `${header} ${rhs}  ${singleComment}` : `${header} ${rhs}`);
    }
  }
  return lines.join("\n");
}
