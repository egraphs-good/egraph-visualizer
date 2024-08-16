import { useState } from "react";
import "./App.css";
import Monaco from "./Monaco";
import Visualizer from "./Visualizer";
import example from "./example";

function App() {
  const [egraph, setEgraph] = useState(example);
  return (
    <div className="flex min-h-screen">
      <div className="flex w-1/3 resize-x overflow-auto">
        <Monaco code={egraph} setCode={setEgraph} />
      </div>

      <div className="flex w-2/3">
        <Visualizer egraph={egraph} />
      </div>
    </div>
  );
}

export default App;
