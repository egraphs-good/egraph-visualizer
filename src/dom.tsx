/// pure dom renderer

import { createRoot } from "react-dom/client";
import Visualizer from "./Visualizer";
import { startTransition } from "react";

/// Mount the visualizer to the given element
/// Call `render` to render a new egraph
/// Call `unmount` to unmount the visualizer
export function mount(element: HTMLElement): { render: (egraph: string) => void; unmount: () => void } {
  const root = createRoot(element);

  function render(egraph: string) {
    startTransition(() => {
      root.render(<Visualizer egraph={egraph} />);
    });
  }

  function unmount() {
    root.unmount();
  }
  return { render, unmount };
}
