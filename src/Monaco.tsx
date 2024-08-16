import MonacoEditor from "react-monaco-editor";

function Monaco({ code, setCode }: { code: string; setCode: (code: string) => void }) {
  return (
    <MonacoEditor
      language="json"
      theme="vs-dark"
      value={code}
      onChange={setCode}
      /// include all default props bc they are now deprecated
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
  );
}

export default Monaco;
