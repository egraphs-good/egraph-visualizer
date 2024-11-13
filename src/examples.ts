const examples = {
  ...import.meta.glob("/examples/manual/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/egraph-serialize/tests/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/extraction-gym/data/*/*.json", { query: "?raw" }),
};

export const defaultExample = "/examples/manual/eggcc-ackerman-split.json";
import DefaultCode from "/examples/manual/eggcc-ackerman-split.json?raw";
export const defaultCode = DefaultCode;

export const exampleNames = Object.keys(examples);

export async function fetchExample(name: string) {
  return ((await examples[name]()) as { default: string }).default;
}
