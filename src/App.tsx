import { use, useState } from "react";
import "./App.css";
import Monaco from "./Monaco";
import { Visualizer } from "./Visualizer";
import DefaultCode from "/examples/manual/homepage.json?raw";

function App() {
  const [egraphPromise, setEGraphPromise] = useState(Promise.resolve(DefaultCode));
  const egraph = use(egraphPromise);
  return (
    <>
      <div className="flex min-h-screen">
        <div className="flex w-1/3 resize-x overflow-auto">
          <Monaco code={egraph} setCode={setEGraphPromise} />
        </div>

        <div className="flex w-2/3">
          <Visualizer egraph={egraph} />
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
