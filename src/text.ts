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

export type TextClassBlock = {
  classID: EGraphClassID;
  type?: string;
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
  const referencedClasses = childIDs.map((childID) => nodeToClass.get(childID) ?? childID);
  const parts = buildOpParts(node.op, referencedClasses, syntax, (classID) => ({
    kind: "classRef",
    classID,
  }));
  return {
    expr: partsToText(parts),
    parts,
    referencedClasses,
  };
}

function formatClassMetadataComments(
  classData: EGraphClassData | undefined,
  isRoot: boolean
): string[] {
  const comments: string[] = [];
  if (isRoot) {
    comments.push("# [root]");
  }
  if (classData) {
    for (const [key, value] of Object.entries(classData)) {
      if (key === "type" || value === undefined) {
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
  const orderedClasses = orderClassesDFS(subgraph);
  const blocks: TextClassBlock[] = [];

  for (const classID of orderedClasses) {
    const entries = classToNodes.get(classID) || [];
    if (entries.length === 0) {
      continue;
    }
    const classData = egraph.class_data?.[classID];
    const isRoot = rootSet.has(classID);
    const metadataComments = formatClassMetadataComments(classData, isRoot);

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
      metadataComments,
      alternatives,
      multiline,
    });
  }

  return blocks;
}

export function blocksToPlainText(blocks: TextClassBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.alternatives.length === 0) {
      continue;
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
