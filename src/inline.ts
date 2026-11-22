import { EGraph, EGraphClassData, EGraphClassID, EGraphNode, EGraphNodeID } from "./layout";
import { formatOpArgs, MISSING_ARG_VALUE, TextSyntax } from "./text";

/**
 * Client-side singleton e-class inliner modeled on `inline_leaves` / `saturate_inline_leaves`
 * from `egraph-serialize`:
 * https://github.com/egraphs-good/egraph-serialize/blob/main/src/algorithms.rs
 *
 * Extensions over upstream `inline_leaves`:
 * - Incorporates the root e-class, extra `class_data`, and `subsumed` preservation guards
 *   proposed in https://github.com/egraphs-good/egraph-serialize/pull/26 so interactive
 *   folding never drops metadata or root e-classes.
 * - Also inlines non-leaf singleton e-classes whenever `parentRefs === 1 || children.length <= 1`
 *   (edge change `m*k - (m+k) <= -1`, so inlining strictly reduces classes, nodes, and edges
 *   without ever adding edges), using an independent-set pass to keep cycles safe.
 */
export { MISSING_ARG_VALUE };
const MAX_INLINED_OP_LENGTH = 4096;
const MAX_SATURATE_PASSES = 64;

export type InlineLevel = number | "max";

export type InlineResult = {
  egraph: EGraph;
  appliedPasses: number;
  canInlineMore: boolean;
};

type SingletonCandidate = {
  eclass: EGraphClassID;
  nodeID: EGraphNodeID;
  node: EGraphNode;
};

function hasExtraClassData(data?: EGraphClassData): boolean {
  if (!data) {
    return false;
  }
  return Object.entries(data).some(([key, value]) => key !== "type" && value !== undefined);
}

function countPlaceholders(op: string): number {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = op.indexOf(MISSING_ARG_VALUE, pos);
    if (idx === -1) {
      return count;
    }
    count += 1;
    pos = idx + MISSING_ARG_VALUE.length;
  }
}

function formatCandidateTemplate(node: EGraphNode, syntax: TextSyntax): string {
  const children = node.children || [];
  if (children.length === 0) {
    return node.op;
  }
  const placeholders = children.map(() => MISSING_ARG_VALUE);
  return formatOpArgs(node.op, placeholders, syntax);
}

/**
 * True when `expr` contains whitespace outside matching brackets/quotes (e.g. `a + b` or `· + ·`),
 * so splicing it raw into a `·` placeholder slot or S-expr argument would lose grouping/precedence.
 */
function hasTopLevelWhitespace(expr: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote !== null) {
      if (ch === "\\" && i + 1 < expr.length) {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && /\s/.test(ch)) {
      return true;
    }
  }
  return false;
}

function formatInlinedParentOp(
  parentOp: string,
  children: EGraphNodeID[],
  resolveTemplate: (childID: EGraphNodeID) => string | undefined,
  syntax: TextSyntax
): string {
  const wrapCompound = countPlaceholders(parentOp) > 0 || syntax === "sexpr";
  const args = children.map((childID) => {
    const tmpl = resolveTemplate(childID);
    if (tmpl === undefined) {
      return MISSING_ARG_VALUE;
    }
    return wrapCompound && hasTopLevelWhitespace(tmpl) ? `(${tmpl})` : tmpl;
  });
  return formatOpArgs(parentOp, args, syntax);
}

function analyzeInlinableSingletons(
  egraph: EGraph,
  syntax: TextSyntax,
  protectedClasses?: ReadonlySet<EGraphClassID>
): {
  candidates: SingletonCandidate[];
  candidateTemplates: Map<EGraphNodeID, string>;
  candidateCosts: Map<EGraphNodeID, number | undefined>;
  parentsToInlined: Map<EGraphNodeID, Set<EGraphNodeID>>;
} {
  const rootSet = new Set(egraph.root_eclasses || []);
  const classToNodes = new Map<EGraphClassID, [EGraphNodeID, EGraphNode][]>();
  const nodeToParents = new Map<EGraphNodeID, Set<EGraphNodeID>>();
  const nodeParentRefCount = new Map<EGraphNodeID, number>();

  for (const [nodeID, node] of Object.entries(egraph.nodes)) {
    let entries = classToNodes.get(node.eclass);
    if (!entries) {
      entries = [];
      classToNodes.set(node.eclass, entries);
    }
    entries.push([nodeID, node]);

    for (const childID of node.children || []) {
      let parents = nodeToParents.get(childID);
      if (!parents) {
        parents = new Set();
        nodeToParents.set(childID, parents);
      }
      parents.add(nodeID);
      nodeParentRefCount.set(childID, (nodeParentRefCount.get(childID) ?? 0) + 1);
    }
  }

  // Eligible singletons: 1 node in class, not root/protected/subsumed/extra-metadata, no self-loop,
  // and `parentRefs === 1 || childRefs <= 1` so inlining strictly removes at least 1 edge.
  const eligible: SingletonCandidate[] = [];
  for (const [eclass, entries] of classToNodes.entries()) {
    if (entries.length !== 1) {
      continue;
    }
    if (
      rootSet.has(eclass) ||
      protectedClasses?.has(eclass) ||
      hasExtraClassData(egraph.class_data?.[eclass])
    ) {
      continue;
    }
    const [nodeID, node] = entries[0];
    if (node.subsumed) {
      continue;
    }
    const parentRefs = nodeParentRefCount.get(nodeID) ?? 0;
    if (parentRefs === 0) {
      continue;
    }
    const children = node.children || [];
    if (parentRefs !== 1 && children.length > 1) {
      continue;
    }
    if (children.includes(nodeID)) {
      continue;
    }
    // Skip any candidate (leaf or non-leaf) whose own op carries extra literal `·`
    // characters beyond its arity (e.g. a leaf `op: "·"` or `·.contains(·, Int(4))`
    // with 1 child), since splicing extra `·` into a parent slot shifts placeholder
    // alignment on later passes. Parents with `dots < children.length` (e.g. `·.select`)
    // or `dots > children.length` remain eligible to receive inlined children.
    if (countPlaceholders(node.op) > children.length) {
      continue;
    }
    eligible.push({ eclass, nodeID, node });
  }

  // Prioritize leaves before middle singletons for predictable bottom-up passes, and choose
  // an independent set so adjacent nodes / cycles are never deleted simultaneously.
  eligible.sort((a, b) => (a.node.children?.length ?? 0) - (b.node.children?.length ?? 0));

  const selected: SingletonCandidate[] = [];
  const selectedSet = new Set<EGraphNodeID>();
  const lockedParents = new Set<EGraphNodeID>();
  const templateByID = new Map<EGraphNodeID, string>();

  for (const cand of eligible) {
    if (lockedParents.has(cand.nodeID)) {
      continue;
    }
    const parents = nodeToParents.get(cand.nodeID)!;
    let parentSelected = false;
    for (const parentID of parents) {
      if (selectedSet.has(parentID)) {
        parentSelected = true;
        break;
      }
    }
    if (parentSelected) {
      continue;
    }

    selected.push(cand);
    selectedSet.add(cand.nodeID);
    templateByID.set(cand.nodeID, formatCandidateTemplate(cand.node, syntax));
    for (const parentID of parents) {
      lockedParents.add(parentID);
    }
  }

  // Guard against unbounded string growth when inlining deep shared chains
  const blocked = new Set<EGraphNodeID>();
  for (const parentNode of Object.values(egraph.nodes)) {
    const children = parentNode.children || [];
    if (children.length === 0) {
      continue;
    }
    const touching = children.filter((c) => templateByID.has(c) && !blocked.has(c));
    if (touching.length === 0) {
      continue;
    }
    const newOp = formatInlinedParentOp(
      parentNode.op,
      children,
      (c) => templateByID.get(c),
      syntax
    );
    if (newOp.length > MAX_INLINED_OP_LENGTH) {
      for (const c of touching) {
        blocked.add(c);
      }
    }
  }

  const candidates = selected.filter((c) => !blocked.has(c.nodeID));
  const candidateTemplates = new Map<EGraphNodeID, string>();
  const candidateCosts = new Map<EGraphNodeID, number | undefined>();
  const parentsToInlined = new Map<EGraphNodeID, Set<EGraphNodeID>>();

  for (const cand of candidates) {
    candidateTemplates.set(cand.nodeID, templateByID.get(cand.nodeID)!);
    candidateCosts.set(cand.nodeID, cand.node.cost);
    for (const parentID of nodeToParents.get(cand.nodeID)!) {
      let set = parentsToInlined.get(parentID);
      if (!set) {
        set = new Set();
        parentsToInlined.set(parentID, set);
      }
      set.add(cand.nodeID);
    }
  }

  return { candidates, candidateTemplates, candidateCosts, parentsToInlined };
}

function inlineLeavesStep(
  egraph: EGraph,
  syntax: TextSyntax,
  protectedClasses: ReadonlySet<EGraphClassID> | undefined,
  nodeWeights: Map<EGraphNodeID, number>
): { egraph: EGraph; inlined: number } {
  const { candidates, candidateTemplates, candidateCosts, parentsToInlined } =
    analyzeInlinableSingletons(egraph, syntax, protectedClasses);
  if (candidates.length === 0) {
    return { egraph, inlined: 0 };
  }

  const nextNodes: { [id: EGraphNodeID]: EGraphNode } = {};
  for (const [nodeID, node] of Object.entries(egraph.nodes)) {
    nextNodes[nodeID] = {
      ...node,
      ...(node.children ? { children: [...node.children] } : {}),
    };
  }

  for (const [parentID, inlinedIDs] of parentsToInlined.entries()) {
    const parent = nextNodes[parentID];
    const children = parent.children || [];

    const hasExplicitCost =
      parent.cost !== undefined ||
      children.some((childID) => inlinedIDs.has(childID) && candidateCosts.get(childID) !== undefined);
    let addedWeight = 0;
    for (const childID of children) {
      if (inlinedIDs.has(childID)) {
        addedWeight += nodeWeights.get(childID) ?? candidateCosts.get(childID) ?? 1;
      }
    }
    const nextWeight = (nodeWeights.get(parentID) ?? parent.cost ?? 1) + addedWeight;
    nodeWeights.set(parentID, nextWeight);

    parent.op = formatInlinedParentOp(
      parent.op,
      children,
      (childID) => (inlinedIDs.has(childID) ? candidateTemplates.get(childID) : undefined),
      syntax
    );
    parent.children = children.flatMap((childID) =>
      inlinedIDs.has(childID) ? egraph.nodes[childID].children || [] : [childID]
    );
    // Drop non-standard children-indexed fields (e.g. `child_roles`) once `children` is rewritten.
    if ("child_roles" in parent) {
      delete (parent as Record<string, unknown>).child_roles;
    }
    if (hasExplicitCost) {
      parent.cost = nextWeight;
    }
  }

  const nextClassData = egraph.class_data ? { ...egraph.class_data } : undefined;
  for (const cand of candidates) {
    delete nextNodes[cand.nodeID];
    nodeWeights.delete(cand.nodeID);
    if (nextClassData) {
      delete nextClassData[cand.eclass];
    }
  }

  return {
    egraph: {
      nodes: nextNodes,
      ...(egraph.root_eclasses ? { root_eclasses: [...egraph.root_eclasses] } : {}),
      ...(nextClassData ? { class_data: nextClassData } : {}),
    },
    inlined: candidates.length,
  };
}

export function inlineLeaves(
  egraph: EGraph,
  level: InlineLevel,
  syntax: TextSyntax = "call",
  protectedClasses?: ReadonlySet<EGraphClassID>
): InlineResult {
  const maxPasses = level === "max" ? MAX_SATURATE_PASSES : Math.max(0, Math.floor(level));
  let current = egraph;
  let appliedPasses = 0;
  const nodeWeights = new Map<EGraphNodeID, number>();

  while (appliedPasses < maxPasses) {
    const step = inlineLeavesStep(current, syntax, protectedClasses, nodeWeights);
    if (step.inlined === 0) {
      return { egraph: current, appliedPasses, canInlineMore: false };
    }
    current = step.egraph;
    appliedPasses += 1;
  }

  const canInlineMore =
    appliedPasses < MAX_SATURATE_PASSES &&
    analyzeInlinableSingletons(current, syntax, protectedClasses).candidates.length > 0;
  return { egraph: current, appliedPasses, canInlineMore };
}
