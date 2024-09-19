# EGraph Visualizer

Interactive visualizer for e-graphs in [the serialized JSON format](https://github.com/egraphs-good/egraph-serialize/)
using Cytoscape JS and Eclipse Layout Kernel.

## Development

First install [Yarn](https://yarnpkg.com/getting-started/install), then run:

```sh
yarn install
yarn run [build|start|lint]
```

## Packaging

Currently, this visualizer is packaged as an [AnyWidget JS ESM file](https://anywidget.dev/) with all dependencies included.
On every Git tag, a new verison is bundled and published as a Github release.

It is also published as an NPM package, which can be imported and used in the browser like this:

```html
<div id="egraph-visualizer"></div>
<link rel="stylesheet" href="https://esm.sh/egraph-visualizer/dist/style.css" />
<script type="module">
  import { mount } from "https://esm.sh/egraph-visualizer";
  const egraph = {
    nodes: {
      "//": {
        op: "/",
        children: ["*", "2"],
        eclass: "top",
      },
      "**": {
        op: "*",
        eclass: "top",
        children: ["a", "/"],
      },
      "*": {
        op: "*",
        eclass: "middle",
        children: ["a", "2"],
      },
      "<<": {
        op: "<<",
        eclass: "middle",
        children: ["a", "1"],
      },
      a: {
        op: "a",
        eclass: "top",
      },
      2: {
        op: "2",
        eclass: "bottom",
      },
      1: {
        op: "1",
        eclass: "right",
      },
      "/": {
        op: "/",
        eclass: "right",
        children: ["2", "2"],
      },
    },
  };
  const mounted = mount(document.getElementById("egraph-visualizer"));
  mounted.render(JSON.stringify(egraph));
  // later can call mounted.unmount() to remove the visualizer
</script>
```

There is also a demo site published on Github Pages, which allows you to upload and edit a serialized e-graph and see
the visualization.
