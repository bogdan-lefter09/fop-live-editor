import { WorkspaceFiles, FileTreeItem } from '../types';

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
  // Flatten the file tree to get all files with their relative paths
  const flattenFileTree = (items: FileTreeItem[], rootFolder: string): string[] => {
    const files: string[] = [];
    
    const traverse = (items: FileTreeItem[], parentPath: string = '') => {
      for (const item of items) {
        if (item.type === 'file') {
          const relativePath = parentPath ? `${parentPath}/${item.path}` : item.path;
          files.push(`${rootFolder}/${relativePath}`);
        } else if (item.type === 'folder' && item.children) {
          const folderPath = parentPath ? `${parentPath}/${item.path}` : item.path;
          traverse(item.children, folderPath);
        }
      }
    };
    
    traverse(items);
    return files.sort();
  };

  const xmlFiles = flattenFileTree(workspaceFiles.xml, 'xml');
  const xslFiles = flattenFileTree(workspaceFiles.xsl, 'xsl');

  return (
    <div className="workspace-toolbar">
      <div className="toolbar-group">
        <label>XML file:</label>
        <select
          value={selectedXmlFile}
          onChange={(e) => onSelectXmlFile(e.target.value)}
        >
          <option value="">Select XML file...</option>
          {xmlFiles.map(file => (
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
          {xslFiles.map(file => (
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
