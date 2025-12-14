import { useState, useRef, useEffect } from 'react';
import { Workspace, WorkspaceFiles } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface FileExplorerProps {
  workspace: Workspace;
  workspaceFiles: WorkspaceFiles;
  onFileClick: (filePath: string) => void;
  onFilesChanged: () => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
  onFileDeleted: (filePath: string) => void;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  folderName: 'xml' | 'xsl' | null;
  filePath: string | null;
  type: 'folder' | 'file';
}

export const FileExplorer = ({ workspace, workspaceFiles, onFileClick, onFilesChanged, onFileRenamed, onFileDeleted }: FileExplorerProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [creatingInFolder, setCreatingInFolder] = useState<'xml' | 'xsl' | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; filePath: string; fileName: string }>({ show: false, filePath: '', fileName: '' });
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
    if (contextMenu.show) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.show]);

  // Focus input when creating file
  useEffect(() => {
    if (isCreatingFile && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isCreatingFile]);

  // Focus input when renaming file
  useEffect(() => {
    if (renamingFile && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFile]);

  const handleFolderContextMenu = (e: React.MouseEvent, folderName: 'xml' | 'xsl') => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      folderName,
      filePath: null,
      type: 'folder'
    });
  };

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    e.stopPropagation();
    const folderName = filePath.startsWith('xml/') ? 'xml' : 'xsl';
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      folderName: folderName as 'xml' | 'xsl',
      filePath,
      type: 'file'
    });
  };

  const handleRefreshClick = async () => {
    setContextMenu({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
    // Trigger rescan of workspace files
    onFilesChanged();
  };

  const handleNewFileClick = () => {
    const targetFolder = contextMenu.folderName;
    setContextMenu({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
    setCreatingInFolder(targetFolder);
    setIsCreatingFile(true);
    setError('');
    
    // Suggest extension based on folder
    const extension = targetFolder === 'xml' ? '.xml' : '.xsl';
    setNewFileName(`newfile${extension}`);
  };

  const handleRenameClick = () => {
    const filePath = contextMenu.filePath;
    setContextMenu({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
    if (filePath) {
      setRenamingFile(filePath);
      // Extract filename from path
      const fileName = filePath.split('/').pop() || '';
      setNewFileName(fileName);
      setError('');
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !creatingInFolder) {
      setError('Filename cannot be empty');
      return;
    }

    try {
      const result = await window.electronAPI.createFile(workspace.path, creatingInFolder, newFileName);
      if (result.success) {
        // Reset state
        setIsCreatingFile(false);
        setCreatingInFolder(null);
        setNewFileName('');
        setError('');
        
        // Refresh file list
        onFilesChanged();
        
        // Open the new file in editor
        onFileClick(result.filePath);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create file');
    }
  };

  const handleRenameFile = async () => {
    if (!newFileName.trim() || !renamingFile) {
      setError('Filename cannot be empty');
      return;
    }

    try {
      const result = await window.electronAPI.renameFile(workspace.path, renamingFile, newFileName);
      if (result.success) {
        // Reset state
        setRenamingFile(null);
        setNewFileName('');
        setError('');
        
        // Notify parent about renamed file so it can update open files
        onFileRenamed(result.oldPath, result.newPath);
        
        // Refresh file list
        onFilesChanged();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to rename file');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateFile();
    } else if (e.key === 'Escape') {
      setIsCreatingFile(false);
      setCreatingInFolder(null);
      setNewFileName('');
      setError('');
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameFile();
    } else if (e.key === 'Escape') {
      setRenamingFile(null);
      setNewFileName('');
      setError('');
    }
  };

  const handleCancelCreate = () => {
    // Delay to allow click on input to register first
    setTimeout(() => {
      setIsCreatingFile(false);
      setCreatingInFolder(null);
      setNewFileName('');
      setError('');
    }, 200);
  };

  const handleCancelRename = () => {
    // Delay to allow click on input to register first
    setTimeout(() => {
      setRenamingFile(null);
      setNewFileName('');
      setError('');
    }, 200);
  };

  const handleDeleteClick = () => {
    if (contextMenu.filePath) {
      const fileName = contextMenu.filePath.split('/').pop() || contextMenu.filePath;
      setDeleteConfirm({ show: true, filePath: contextMenu.filePath, fileName });
      setContextMenu({ show: false, x: 0, y: 0, folderName: null, filePath: null, type: 'folder' });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const result = await window.electronAPI.deleteFile(workspace.path, deleteConfirm.filePath);
      
      if (result.success) {
        onFileDeleted(deleteConfirm.filePath);
        onFilesChanged();
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      setError(error.message || 'Failed to delete file');
      setTimeout(() => setError(''), 3000);
    } finally {
      setDeleteConfirm({ show: false, filePath: '', fileName: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, filePath: '', fileName: '' });
  };

  return (
    <div className="file-explorer">
      <div className="panel-header">
        <h4>EXPLORER</h4>
      </div>
      <div className="file-tree">
        <div className="workspace-name">{workspace.name}</div>

        {/* XML Folder */}
        <div 
          className="file-tree-item folder"
          onContextMenu={(e) => handleFolderContextMenu(e, 'xml')}
        >
          <span className="folder-icon">📁</span> xml
        </div>
        {workspaceFiles.xml.map(file => (
          renamingFile === file ? (
            <div key={file} className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
              <span className="file-icon">📄</span>
              <input
                ref={renameInputRef}
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleCancelRename}
                onMouseDown={(e) => e.stopPropagation()}
                className="file-name-input"
              />
              {error && <div className="file-create-error">{error}</div>}
            </div>
          ) : (
            <div
              key={file}
              className="file-tree-item file"
              style={{ paddingLeft: '28px' }}
              onClick={() => onFileClick(file)}
              onContextMenu={(e) => handleFileContextMenu(e, file)}
            >
              <span className="file-icon">📄</span> {file.replace('xml/', '')}
            </div>
          )
        ))}
        {isCreatingFile && creatingInFolder === 'xml' && (
          <div className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
            <span className="file-icon">📄</span>
            <input
              ref={inputRef}
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCancelCreate}
              onMouseDown={(e) => e.stopPropagation()}
              className="file-name-input"
            />
            {error && <div className="file-create-error">{error}</div>}
          </div>
        )}

        {/* XSL Folder */}
        <div 
          className="file-tree-item folder"
          onContextMenu={(e) => handleFolderContextMenu(e, 'xsl')}
        >
          <span className="folder-icon">📁</span> xsl
        </div>
        {workspaceFiles.xsl.map(file => (
          renamingFile === file ? (
            <div key={file} className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
              <span className="file-icon">📄</span>
              <input
                ref={renameInputRef}
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleCancelRename}
                onMouseDown={(e) => e.stopPropagation()}
                className="file-name-input"
              />
              {error && <div className="file-create-error">{error}</div>}
            </div>
          ) : (
            <div
              key={file}
              className="file-tree-item file"
              style={{ paddingLeft: '28px' }}
              onClick={() => onFileClick(file)}
              onContextMenu={(e) => handleFileContextMenu(e, file)}
            >
              <span className="file-icon">📄</span> {file.replace('xsl/', '')}
            </div>
          )
        ))}
        {isCreatingFile && creatingInFolder === 'xsl' && (
          <div className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
            <span className="file-icon">📄</span>
            <input
              ref={inputRef}
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCancelCreate}
              onMouseDown={(e) => e.stopPropagation()}
              className="file-name-input"
            />
            {error && <div className="file-create-error">{error}</div>}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.show && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' && (
            <>
              <div className="context-menu-item" onClick={handleNewFileClick}>
                New File
              </div>
              <div className="context-menu-item" onClick={handleRefreshClick}>
                Refresh
              </div>
            </>
          )}
          {contextMenu.type === 'file' && (
            <>
              <div className="context-menu-item" onClick={handleRenameClick}>
                Rename
              </div>
              <div className="context-menu-item" onClick={handleDeleteClick}>
                Delete
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        show={deleteConfirm.show}
        title="Delete File"
        message={`Are you sure you want to delete '${deleteConfirm.fileName}'?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDestructive={true}
      />
    </div>
  );
};
