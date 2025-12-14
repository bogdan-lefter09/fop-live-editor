import { WorkspaceFiles } from '../types';

interface ToolbarProps {
  workspaceFiles: WorkspaceFiles;
  selectedXmlFile: string;
  selectedXslFile: string;
  autoGenerate: boolean;
  onSelectXmlFile: (file: string) => void;
  onSelectXslFile: (file: string) => void;
  onToggleAutoGenerate: (enabled: boolean) => void;
  onGeneratePDF: () => void;
}

export const Toolbar = ({
  workspaceFiles,
  selectedXmlFile,
  selectedXslFile,
  autoGenerate,
  onSelectXmlFile,
  onSelectXslFile,
  onToggleAutoGenerate,
  onGeneratePDF,
}: ToolbarProps) => {
  return (
    <div className="workspace-toolbar">
      <div className="toolbar-group">
        <label>XML file:</label>
        <select
          value={selectedXmlFile}
          onChange={(e) => onSelectXmlFile(e.target.value)}
        >
          <option value="">Select XML file...</option>
          {workspaceFiles.xml.map(file => (
            <option key={file} value={file}>{file.replace('xml/', '')}</option>
          ))}
        </select>
      </div>

      <div className="toolbar-group">
        <label>XSL file:</label>
        <select
          value={selectedXslFile}
          onChange={(e) => onSelectXslFile(e.target.value)}
        >
          <option value="">Select XSL file...</option>
          {workspaceFiles.xsl.map(file => (
            <option key={file} value={file}>{file.replace('xsl/', '')}</option>
          ))}
        </select>
      </div>

      <div className="toolbar-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={autoGenerate}
            onChange={(e) => onToggleAutoGenerate(e.target.checked)}
          />
          Auto-generate
        </label>
      </div>

      <button
        className="btn btn-primary"
        onClick={onGeneratePDF}
        disabled={!selectedXmlFile || !selectedXslFile}
      >
        Generate PDF
      </button>
    </div>
  );
};
