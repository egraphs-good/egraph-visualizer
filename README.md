# EGraph Visualizer

This packages aims to help with debugging and teaching e-graphs through an interactive visualization.

It supports any e-graph [serialized in the JSON format](https://github.com/egraphs-good/egraph-serialize/)

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

## Development

First install [Yarn](https://yarnpkg.com/getting-started/install), then run:

```sh
yarn install
yarn run [build|start|lint]
```

## Contributing

This package is open to external contributors. Feel free to open a pull request or an issue for bugs or desired features.
It is developed as part of the EGRAPHS community and can also be discussed in the [EGRAPHS zulip](https://egraphs.org/zulip/).

@saulshanabrook is the current maintainor of this package, but others can be added after contributing.
