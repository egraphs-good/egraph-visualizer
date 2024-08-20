import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DOMWidgetModel } from "@jupyter-widgets/base";
import Visualizer from "./Visualizer.tsx";

// eslint-disable-next-line react-refresh/only-export-components
function ModelApp({ model }: { model: DOMWidgetModel }) {
  const egraph: string = useSyncExternalStore(
    (callback) => {
      model.on("change:egraph", callback);
      return () => model.off("change:egraph", callback);
    },
    () => model.get("egraph")
  );
  return <Visualizer egraph={egraph} />;
}

function render({ model, el }: { el: HTMLElement; model: DOMWidgetModel }) {
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <ModelApp model={model} />
    </StrictMode>
  );
  return () => root.unmount();
}

export default { render };
