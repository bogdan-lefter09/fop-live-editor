import Editor from '@monaco-editor/react';
import { OpenFile } from '../types';

interface EditorPaneProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  editorReloadKey: number;
  onEditorChange: (value: string | undefined) => void;
  onEditorMount: (editor: any) => void;
  onCloseFile: (index: number) => void;
  onSelectFile: (index: number) => void;
}

export const EditorPane = ({
  openFiles,
  activeFileIndex,
  editorReloadKey,
  onEditorChange,
  onEditorMount,
  onCloseFile,
  onSelectFile,
}: EditorPaneProps) => {
  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  if (openFiles.length === 0) {
    return (
      <div className="editor-area">
        <p className="placeholder-text">No files open. Click a file in the explorer to edit.</p>
      </div>
    );
  }

  return (
    <div className="editor-area">
      {/* Inner File Tabs */}
      <div className="inner-file-tabs">
        {openFiles.map((file, index) => (
          <div
            key={file.path}
            className={`inner-tab ${activeFileIndex === index ? 'active' : ''}`}
            onClick={() => onSelectFile(index)}
          >
            <span className="tab-name">
              {file.isDirty && <span className="dirty-indicator">● </span>}
              {file.name}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(index);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Monaco Editor */}
      {activeFile && (
        <div className="editor-container-monaco">
          <Editor
            key={`${activeFile.path}-${editorReloadKey}`}
            height="100%"
            language="xml"
            theme="vs-dark"
            value={activeFile.content}
            onChange={onEditorChange}
            onMount={onEditorMount}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>
      )}
    </div>
  );
};
