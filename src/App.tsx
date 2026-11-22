import { useCallback, useMemo, useState } from "react";
import Monaco from "./Monaco";
import { Visualizer } from "./Visualizer";
import { TextSyntax } from "./text";
import { defaultCode, defaultExample, fetchExample } from "./examples";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

const SEXPR_EXAMPLES = new Set([
  "/examples/manual/eqsat-basic.json",
  "/examples/manual/egg-homepage.json",
  "/examples/manual/path-proof.json",
]);

function isEGraphObject(value: unknown): value is { nodes: Record<string, unknown> } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { nodes?: unknown }).nodes === "object" &&
    (value as { nodes?: unknown }).nodes !== null
  );
}

/**
 * Accepts either a single serialized EGraph JSON object or a JSON array of EGraph
 * snapshots (so multi-step saturation examples expose the visualizer's step slider).
 */
function parseEGraphSteps(raw: string): { steps: string[]; isArray: boolean } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isEGraphObject)) {
      return { steps: parsed.map((step) => JSON.stringify(step)), isArray: true };
    }
  } catch {
    // Pass raw text through so Visualizer surfaces any JSON syntax error directly
  }
  return { steps: [raw], isArray: false };
}

function App() {
  const [example, setExample] = useState<string>(defaultExample);
  const exampleQuery = useQuery({
    queryKey: ["example", example],
    queryFn: () => fetchExample(example),
    staleTime: Infinity,
    retry: false,
    retryOnMount: false,
    placeholderData: keepPreviousData,
  });
  const [modifications, setModifications] = useState<{
    initial: string;
    replaced?: string[];
    updates: string[];
  }>({ initial: defaultCode, updates: [] });

  const data = exampleQuery.data || defaultCode;
  const addModification = useCallback(
    (change: string) => {
      const parsed = parseEGraphSteps(change);
      if (parsed.isArray) {
        // Editing a multi-step array replaces the step list rather than duplicating all steps
        setModifications({
          initial: data,
          replaced: parsed.steps,
          updates: [],
        });
        return;
      }
      const prevUpToDate = modifications.initial === data;
      setModifications({
        initial: data,
        replaced: prevUpToDate ? modifications.replaced : undefined,
        updates: [...(prevUpToDate ? modifications.updates : []), change],
      });
    },
    [data, modifications]
  );

  const egraphs = useMemo(() => {
    const modificationsUpToDate = modifications.initial === exampleQuery.data;
    if (modificationsUpToDate) {
      const base = modifications.replaced ?? parseEGraphSteps(data).steps;
      return [...base, ...modifications.updates];
    }
    return parseEGraphSteps(data).steps;
  }, [data, modifications, exampleQuery.data]);

  const defaultTextSyntax: TextSyntax = SEXPR_EXAMPLES.has(example) ? "sexpr" : "call";

  return (
    <>
      <div className="flex min-h-screen">
        <div className="flex w-1/3 resize-x overflow-auto">
          <Monaco
            addModification={addModification}
            initialCode={data}
            exampleQuery={exampleQuery}
            example={example}
            setExample={setExample}
          />
        </div>

        <div className="flex w-2/3">
          <Visualizer egraphs={egraphs} textSyntax={defaultTextSyntax} />
        </div>
      </div>
      <footer className="p-2 fixed bottom-0 min-w-full text-xs text-gray-500 text-right dark:text-gray-400">
        <a href="https://github.com/egraphs-good/egraph-visualizer" target="_blank" className="hover:underline">
          github.com/egraphs-good/egraph-visualizer
        </a>
      </footer>
    </>
  );
}

export default App;
