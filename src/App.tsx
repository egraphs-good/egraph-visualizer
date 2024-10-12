import { useCallback, useState } from "react";
import Monaco from "./Monaco";
import { Visualizer } from "./Visualizer";
import { defaultCode, defaultExample, fetchExample } from "./examples";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

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
  const [modifications, setModifications] = useState<{ initial: string; updates: string[] }>({ initial: defaultCode, updates: [] });

  const data = exampleQuery.data || defaultExample;
  const addModification = useCallback(
    (change: string) => {
      const updates = modifications.initial === data ? modifications.updates : [];

      setModifications({
        initial: data,
        updates: [...updates, change],
      });
    },
    [data, modifications.initial, modifications.updates]
  );
  const egraphs = [data];
  const modificationsUpToDate = modifications.initial === exampleQuery.data;
  if (modificationsUpToDate) {
    egraphs.push(...modifications.updates);
  }
  //
  return (
    <>
      <div className="flex min-h-screen">
        <div className="flex w-1/3 resize-x overflow-auto">
          <Monaco
            addModification={addModification}
            initialCode={egraphs[0]}
            exampleQuery={exampleQuery}
            example={example}
            setExample={setExample}
          />
        </div>

        <div className="flex w-2/3">
          <Visualizer egraphs={egraphs} />
        </div>
      </div>
      <footer className="p-2 fixed bottom-0 min-w-full text-xs text-gray-500 text-right dark:text-gray-400">
        <a href="https://github.com/saulshanabrook/egraph-visualizer" target="_blank" className="hover:underline">
          github.com/saulshanabrook/egraph-visualizer
        </a>
      </footer>
    </>
  );
}

export default App;
