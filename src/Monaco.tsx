/// <reference types="react/canary" />

import { startTransition, useCallback, useState } from "react";
import MonacoEditor from "react-monaco-editor";

const examples = {
  ...import.meta.glob("/examples/manual/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/egraph-serialize/tests/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/extraction-gym/data/*/*.json", { query: "?raw" }),
};

const defaultExample = "/examples/manual/homepage.json";

function Monaco({ code, setCode }: { code: string; setCode: (code: Promise<string>) => void }) {
  const [selectedPreset, setSelectedPreset] = useState(defaultExample);
  const handlePresetChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const preset = event.target.value;
      setSelectedPreset(preset);
      setCode(examples[preset]().then((loaded) => (loaded as { default: string }).default));
    },
    [setCode, setSelectedPreset]
  );

  const setCodeString = useCallback(
    (code: string) => {
      startTransition(() => {
        setCode(Promise.resolve(code));
      });
    },
    [setCode]
  );

  return (
    <div className="flex flex-col h-full w-full">
      <select value={selectedPreset} onChange={handlePresetChange} className="m-1 p-2 border border-gray-300 rounded">
        <option value="" disabled>
          Select a preset
        </option>
        {Object.keys(examples).map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
      </select>
      <MonacoEditor
        language="json"
        theme="vs-dark"
        value={code}
        onChange={setCodeString}
        width="100%"
        height="100%"
        defaultValue=""
        options={{}}
        overrideServices={{}}
        editorWillMount={() => {}}
        editorDidMount={() => {}}
        editorWillUnmount={() => {}}
        className={null}
      />
    </div>
  );
}

export default Monaco;
