import { useCallback, useState } from "react";
import MonacoEditor from "react-monaco-editor";
import { exampleNames } from "./examples";
import { UseQueryResult } from "@tanstack/react-query";
import { Select, SelectListItem, SelectListBox, SelectButton, SelectPopover } from "./react-aria-components-tailwind-starter/src/select";
import { Key } from "react-aria-components";
import { Button } from "./react-aria-components-tailwind-starter/src/button";
import { Loading } from "./Loading";

function Monaco({
  exampleQuery,
  setModifiedCode,
  example,
  setExample,
}: {
  exampleQuery: UseQueryResult<string, Error>;
  setModifiedCode: (code: string | null) => void;
  example: string;
  setExample: (example: string) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const handlePresetChange = useCallback(
    (preset: Key) => {
      setExample(preset as string);
      setCode(null);
      setModifiedCode(null);
    },
    [setExample, setModifiedCode]
  );

  const currentValue = code || exampleQuery.data;

  const handleUpdate = useCallback(() => {
    setModifiedCode(currentValue || null);
  }, [currentValue, setModifiedCode]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex p-2">
        <Select
          placeholder="Select a preset"
          selectedKey={example}
          onSelectionChange={handlePresetChange}
          aria-label="Select a preset file to load"
        >
          <SelectButton />

          <SelectPopover>
            <SelectListBox>
              {exampleNames.map((preset) => (
                <SelectListItem key={preset} id={preset}>
                  {preset}
                </SelectListItem>
              ))}
            </SelectListBox>
          </SelectPopover>
        </Select>
        <Button className="ml-2" onPress={handleUpdate} variant="outline">
          Update
        </Button>
      </div>
      {exampleQuery.isFetching && <Loading />}
      {exampleQuery.status == "error" ? (
        <div className="p-4">Error loading example: {exampleQuery.error.message}</div>
      ) : (
        <MonacoEditor
          language="json"
          theme="vs-dark"
          value={currentValue}
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
      )}
    </div>
  );
}

export default Monaco;
