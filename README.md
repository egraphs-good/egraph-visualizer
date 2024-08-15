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

In the future, if others want to use it, it could be published as an NPM package.

There is also a demo site published on Github Pages, which allows you to upload and edit a serialized e-graph and see
the visualization.
