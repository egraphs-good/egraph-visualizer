/// <reference types="react/canary" />

import { startTransition, use, useEffect, useMemo, useState } from "react";
import MonacoEditor from "react-monaco-editor";

const modules = {
  ...import.meta.glob("/examples/egraph-serialize/tests/*.json"),
  ...import.meta.glob("/examples/extraction-gym/data/*/*.json"),
  ...import.meta.glob("/examples/extraction-gym/test-data/*/*.json"),
};

function Monaco({ code, setCode }: { code: string; setCode: (code: string) => void }) {
  const [selectedPreset, setSelectedPreset] = useState("");
  const [loadPreset, setLoadPreset] = useState(false);
  const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = event.target.value;
    startTransition(() => {
      setSelectedPreset(preset);
      setLoadPreset(true);
    });
  };
  const presetPromise = useMemo(() => (loadPreset ? modules[selectedPreset]() : null), [selectedPreset, loadPreset]);
  const loadedPreset = presetPromise ? use(presetPromise) : null;

  useEffect(() => {
    if (loadedPreset) {
      startTransition(() => {
        setCode(JSON.stringify(loadedPreset, null, 2));
        setLoadPreset(false);
      });
    }
  }, [loadedPreset, setCode, setLoadPreset]);

  return (
    <div className="flex flex-col h-full w-full">
      <select value={selectedPreset} onChange={handlePresetChange} className="m-1 p-2 border border-gray-300 rounded">
        <option value="" disabled>
          Select a preset
        </option>
        {Object.keys(modules).map((preset) => (
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
