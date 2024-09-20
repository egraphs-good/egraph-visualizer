import { createRoot } from "react-dom/client";
import "./index.css";
import { DOMWidgetModel } from "@jupyter-widgets/base";
import Visualizer from "./Visualizer.tsx";
import { startTransition } from "react";

function render({ model, el }: { el: HTMLElement; model: DOMWidgetModel }) {
  const root = createRoot(el);
  const height = model.has("height") ? model.get("height") : "600px";
  function render() {
    startTransition(() => {
      root.render(<Visualizer egraph={model.get("egraph")} height={height} resize />);
    });
  }
  render();
  model.on("change:egraph", render);

  return () => {
    model.off("change:egraph", render);
    root.unmount();
  };
}

export default { render };
