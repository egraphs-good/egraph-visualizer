/// <reference types="react/canary" />

import { startTransition, use, useEffect, useMemo, useState } from "react";
import MonacoEditor from "react-monaco-editor";

const examples = {
  ...import.meta.glob("/examples/egraph-serialize/tests/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/extraction-gym/data/*/*.json", { query: "?raw" }),
  ...import.meta.glob("/examples/manual/*.json", { query: "?raw" }),
};

const defaultExample = "/examples/manual/homepage.json";

function Monaco({ code, setCode }: { code: string; setCode: (code: string) => void }) {
  const [selectedPreset, setSelectedPreset] = useState(defaultExample);
  const [loadPreset, setLoadPreset] = useState(false);
  const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = event.target.value;
    startTransition(() => {
      setSelectedPreset(preset);
      setLoadPreset(true);
    });
  };
  const presetPromise = useMemo(() => (loadPreset ? examples[selectedPreset]() : null), [selectedPreset, loadPreset]);
  const loadedPreset = presetPromise ? use(presetPromise) : null;

  useEffect(() => {
    if (loadedPreset) {
      const codeStr = (loadedPreset as { default: string }).default;
      setCode(JSON.stringify(JSON.parse(codeStr), null, 2));
      setLoadPreset(false);
    }
  }, [loadedPreset, setCode, setLoadPreset]);

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
        onChange={setCode}
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
