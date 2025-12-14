import { Workspace, WorkspaceFiles } from '../types';

interface FileExplorerProps {
  workspace: Workspace;
  workspaceFiles: WorkspaceFiles;
  onFileClick: (filePath: string) => void;
}

export const FileExplorer = ({ workspace, workspaceFiles, onFileClick }: FileExplorerProps) => {
  return (
    <div className="file-explorer">
      <div className="panel-header">
        <h4>EXPLORER</h4>
      </div>
      <div className="file-tree">
        <div className="workspace-name">{workspace.name}</div>

        {/* XML Folder */}
        <div className="file-tree-item folder">
          <span className="folder-icon">📁</span> xml
        </div>
        {workspaceFiles.xml.map(file => (
          <div
            key={file}
            className="file-tree-item file"
            style={{ paddingLeft: '28px' }}
            onClick={() => onFileClick(file)}
          >
            <span className="file-icon">📄</span> {file.replace('xml/', '')}
          </div>
        ))}

        {/* XSL Folder */}
        <div className="file-tree-item folder">
          <span className="folder-icon">📁</span> xsl
        </div>
        {workspaceFiles.xsl.map(file => (
          <div
            key={file}
            className="file-tree-item file"
            style={{ paddingLeft: '28px' }}
            onClick={() => onFileClick(file)}
          >
            <span className="file-icon">📄</span> {file.replace('xsl/', '')}
          </div>
        ))}
      </div>
    </div>
  );
};
