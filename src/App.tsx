import { useState } from "react";
import "./App.css";
import Monaco from "./Monaco";
import Visualizer from "./Visualizer";
import DefaultCode from "/examples/manual/homepage.json?raw";

function App() {
  const [egraph, setEgraph] = useState(DefaultCode);
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
