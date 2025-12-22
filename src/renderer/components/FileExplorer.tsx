import { useState, useRef, useEffect } from 'react';
import { Workspace, WorkspaceFiles, FileTreeItem } from '../types';
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
  folderPath: string | null; // Full relative path to folder (e.g., "xml", "xml/subfolder")
  filePath: string | null;
  type: 'folder' | 'file';
  rootFolder: 'xml' | 'xsl' | null; // Which root folder this belongs to
}

export const FileExplorer = ({ workspace, workspaceFiles, onFileClick, onFilesChanged, onFileRenamed, onFileDeleted }: FileExplorerProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [creatingInFolder, setCreatingInFolder] = useState<string | null>(null); // Full path like "xml" or "xml/subfolder"
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null); // Full path where we're creating folder
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; filePath: string; fileName: string; isFolder?: boolean }>({ show: false, filePath: '', fileName: '' });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['xml', 'xsl'])); // Track which folders are expanded
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
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

  // Focus input when creating folder
  useEffect(() => {
    if (isCreatingFolder && folderInputRef.current) {
      folderInputRef.current.focus();
      folderInputRef.current.select();
    }
  }, [isCreatingFolder]);

  // Focus input when renaming file
  useEffect(() => {
    if (renamingFile && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFile]);

  // Keyboard shortcuts (Delete and F5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (isCreatingFile || isCreatingFolder || renamingFile) return;

      // Delete key - delete selected file
      if (e.key === 'Delete' && selectedFile) {
        e.preventDefault();
        const fileName = selectedFile.split('/').pop() || selectedFile;
        setDeleteConfirm({ show: true, filePath: selectedFile, fileName });
      }

      // F5 key - refresh workspace
      if (e.key === 'F5') {
        e.preventDefault();
        onFilesChanged();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, isCreatingFile, isCreatingFolder, renamingFile, onFilesChanged]);

  const handleFolderContextMenu = (e: React.MouseEvent, folderPath: string, rootFolder: 'xml' | 'xsl') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      folderPath,
      filePath: null,
      type: 'folder',
      rootFolder
    });
  };

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string, rootFolder: 'xml' | 'xsl') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      folderPath: null,
      filePath,
      type: 'file',
      rootFolder
    });
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const handleRefreshClick = async () => {
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    onFilesChanged();
  };

  const handleNewFileClick = () => {
    const targetFolder = contextMenu.folderPath;
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    // Expand the folder so the input is visible
    if (targetFolder) {
      setExpandedFolders(prev => new Set(prev).add(targetFolder));
    }
    setCreatingInFolder(targetFolder);
    setIsCreatingFile(true);
    setError('');
    
    // Suggest extension based on root folder
    const extension = contextMenu.rootFolder === 'xml' ? '.xml' : '.xsl';
    setNewFileName(`newfile${extension}`);
  };

  const handleNewFolderClick = () => {
    const targetFolder = contextMenu.folderPath;
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    // Expand the folder so the input is visible
    if (targetFolder) {
      setExpandedFolders(prev => new Set(prev).add(targetFolder));
    }
    setCreatingFolderIn(targetFolder);
    setIsCreatingFolder(true);
    setError('');
    setNewFolderName('newfolder');
  };

  const handleRenameClick = () => {
    const filePath = contextMenu.filePath;
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    if (filePath) {
      setRenamingFile(filePath);
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
        setIsCreatingFile(false);
        setCreatingInFolder(null);
        setNewFileName('');
        setError('');
        onFilesChanged();
        onFileClick(result.filePath);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create file');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !creatingFolderIn) {
      setError('Folder name cannot be empty');
      return;
    }

    try {
      const result = await window.electronAPI.createFolder(workspace.path, creatingFolderIn, newFolderName);
      if (result.success) {
        setIsCreatingFolder(false);
        setCreatingFolderIn(null);
        setNewFolderName('');
        setError('');
        // Expand the parent folder so the new folder is visible
        setExpandedFolders(prev => new Set(prev).add(creatingFolderIn));
        onFilesChanged();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create folder');
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

  const handleFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setIsCreatingFolder(false);
      setCreatingFolderIn(null);
      setNewFolderName('');
      setError('');
    }
  };

  const handleCancelCreate = () => {
    setTimeout(() => {
      setIsCreatingFile(false);
      setCreatingInFolder(null);
      setNewFileName('');
      setError('');
    }, 200);
  };

  const handleCancelCreateFolder = () => {
    setTimeout(() => {
      setIsCreatingFolder(false);
      setCreatingFolderIn(null);
      setNewFolderName('');
      setError('');
    }, 200);
  };

  const handleCancelRename = () => {
    setTimeout(() => {
      setRenamingFile(null);
      setNewFileName('');
      setError('');
    }, 200);
  };

  const handleDeleteClick = () => {
    if (contextMenu.filePath) {
      const fileName = contextMenu.filePath.split('/').pop() || contextMenu.filePath;
      setDeleteConfirm({ show: true, filePath: contextMenu.filePath, fileName, isFolder: false });
      setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    }
  };

  const handleDeleteFolderClick = () => {
    if (contextMenu.folderPath) {
      const folderName = contextMenu.folderPath.split('/').pop() || contextMenu.folderPath;
      setDeleteConfirm({ show: true, filePath: contextMenu.folderPath, fileName: folderName, isFolder: true });
      setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      if (deleteConfirm.isFolder) {
        const result = await window.electronAPI.deleteFolder(workspace.path, deleteConfirm.filePath);
        if (result.success) {
          onFilesChanged();
        }
      } else {
        const result = await window.electronAPI.deleteFile(workspace.path, deleteConfirm.filePath);
        if (result.success) {
          onFileDeleted(deleteConfirm.filePath);
          onFilesChanged();
        }
      }
    } catch (error: any) {
      console.error(`Error deleting ${deleteConfirm.isFolder ? 'folder' : 'file'}:`, error);
      setError(error.message || `Failed to delete ${deleteConfirm.isFolder ? 'folder' : 'file'}`);
      setTimeout(() => setError(''), 3000);
    } finally {
      setDeleteConfirm({ show: false, filePath: '', fileName: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, filePath: '', fileName: '' });
  };

  // Recursive function to render file tree
  const renderFileTree = (items: FileTreeItem[], rootFolder: 'xml' | 'xsl', parentPath: string = rootFolder, depth: number = 1) => {
    return items.map((item) => {
      const fullPath = `${parentPath}/${item.path}`;
      const paddingLeft = `${(depth + 1) * 14}px`;

      if (item.type === 'folder') {
        const isExpanded = expandedFolders.has(fullPath);
        
        return (
          <div key={fullPath}>
            <div
              className={`file-tree-item folder ${selectedFile === fullPath ? 'selected' : ''}`}
              style={{ paddingLeft }}
              onClick={() => toggleFolder(fullPath)}
              onContextMenu={(e) => handleFolderContextMenu(e, fullPath, rootFolder)}
            >
              <span className="folder-icon">{isExpanded ? '📂' : '📁'}</span> {item.name}
            </div>

            {isExpanded && item.children && renderFileTree(item.children, rootFolder, fullPath, depth + 1)}
            
            {/* Show folder creation input */}
            {isCreatingFolder && creatingFolderIn === fullPath && isExpanded && (
              <div className="file-tree-item file-create" style={{ paddingLeft: `${(depth + 2) * 14}px` }}>
                <span className="folder-icon">📁</span>
                <input
                  ref={folderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleFolderKeyDown}
                  onBlur={handleCancelCreateFolder}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="file-name-input"
                />
                {error && <div className="file-create-error">{error}</div>}
              </div>
            )}

            {/* Show file creation input */}
            {isCreatingFile && creatingInFolder === fullPath && isExpanded && (
              <div className="file-tree-item file-create" style={{ paddingLeft: `${(depth + 2) * 14}px` }}>
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
        );
      } else {
        // File
        const fileFullPath = `${rootFolder}/${item.path}`;
        
        if (renamingFile === fileFullPath) {
          return (
            <div key={fileFullPath} className="file-tree-item file-create" style={{ paddingLeft }}>
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
          );
        }

        return (
          <div
            key={fileFullPath}
            className={`file-tree-item ${selectedFile === fileFullPath ? 'selected' : ''}`}
            style={{ paddingLeft }}
            onClick={() => { setSelectedFile(fileFullPath); onFileClick(fileFullPath); }}
            onContextMenu={(e) => handleFileContextMenu(e, fileFullPath, rootFolder)}
          >
            <span className="file-icon">📄</span> {item.name}
          </div>
        );
      }
    });
  };

  return (
    <div className="file-explorer">
      <div className="panel-header">
        <h4>EXPLORER</h4>
      </div>
      <div className="file-tree">
        <div className="workspace-name">{workspace.name}</div>

        {/* XML Root Folder */}
        <div 
          className={`file-tree-item folder ${selectedFile === 'xml' ? 'selected' : ''}`}
          onClick={() => toggleFolder('xml')}
          onContextMenu={(e) => handleFolderContextMenu(e, 'xml', 'xml')}
        >
          <span className="folder-icon">{expandedFolders.has('xml') ? '📂' : '📁'}</span> xml
        </div>
        {expandedFolders.has('xml') && renderFileTree(workspaceFiles.xml, 'xml')}
        
        {/* File/Folder creation in XML root */}
        {isCreatingFile && creatingInFolder === 'xml' && expandedFolders.has('xml') && (
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
        {isCreatingFolder && creatingFolderIn === 'xml' && expandedFolders.has('xml') && (
          <div className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
            <span className="folder-icon">📁</span>
            <input
              ref={folderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleFolderKeyDown}
              onBlur={handleCancelCreateFolder}
              onMouseDown={(e) => e.stopPropagation()}
              className="file-name-input"
            />
            {error && <div className="file-create-error">{error}</div>}
          </div>
        )}

        {/* XSL Root Folder */}
        <div 
          className={`file-tree-item folder ${selectedFile === 'xsl' ? 'selected' : ''}`}
          onClick={() => toggleFolder('xsl')}
          onContextMenu={(e) => handleFolderContextMenu(e, 'xsl', 'xsl')}
        >
          <span className="folder-icon">{expandedFolders.has('xsl') ? '📂' : '📁'}</span> xsl
        </div>
        {expandedFolders.has('xsl') && renderFileTree(workspaceFiles.xsl, 'xsl')}
        
        {/* File/Folder creation in XSL root */}
        {isCreatingFile && creatingInFolder === 'xsl' && expandedFolders.has('xsl') && (
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
        {isCreatingFolder && creatingFolderIn === 'xsl' && expandedFolders.has('xsl') && (
          <div className="file-tree-item file-create" style={{ paddingLeft: '28px' }}>
            <span className="folder-icon">📁</span>
            <input
              ref={folderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleFolderKeyDown}
              onBlur={handleCancelCreateFolder}
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
              <div className="context-menu-item" onClick={handleNewFolderClick}>
                New Folder
              </div>
              <div className="context-menu-item" onClick={handleRefreshClick}>
                Refresh
              </div>
              {/* Show Delete only for non-root folders */}
              {contextMenu.folderPath !== 'xml' && contextMenu.folderPath !== 'xsl' && (
                <div className="context-menu-item" onClick={handleDeleteFolderClick}>
                  Delete
                </div>
              )}
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
        title={deleteConfirm.isFolder ? "Delete Folder" : "Delete File"}
        message={
          deleteConfirm.isFolder
            ? `Are you sure you want to delete folder '${deleteConfirm.fileName}' and all its contents?`
            : `Are you sure you want to delete '${deleteConfirm.fileName}'?`
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDestructive={true}
      />
    </div>
  );
};
