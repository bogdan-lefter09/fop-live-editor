import { useState, useRef, useEffect } from 'react';
import { Workspace, WorkspaceFiles, FileTreeItem } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from '../context/ToastContext';

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

// Undoable operations (Ctrl+Z). Folder delete is intentionally excluded - restoring a
// recursively-deleted folder tree safely is out of scope for this simple undo stack.
type UndoAction =
  | { type: 'rename-file'; oldPath: string; newPath: string }
  | { type: 'rename-folder'; oldPath: string; newPath: string }
  | { type: 'delete-file'; filePath: string; fileName: string; content: string };


export const FileExplorer = ({ workspace, workspaceFiles, onFileClick, onFilesChanged, onFileRenamed, onFileDeleted }: FileExplorerProps) => {
  const { showToast } = useToast();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [creatingInFolder, setCreatingInFolder] = useState<string | null>(null); // Full path like "xml" or "xml/subfolder"
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null); // Full path where we're creating folder
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; filePath: string; fileName: string; isFolder?: boolean; bulkPaths?: string[] }>({ show: false, filePath: '', fileName: '' });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // Multi-select support (files only): the set of currently selected file paths,
  // and a ref tracking the order in which files are visible for Shift-click range selection.
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const visibleFilesOrder = useRef<string[]>([]);
  // In-app clipboard for copy/paste of files (Ctrl+C / Ctrl+V, or the context menu)
  const [clipboard, setClipboard] = useState<string[] | null>(null);
  // Undo history for rename/delete operations (Ctrl+Z). Kept in a ref since nothing
  // renders based on its contents - only its presence/order matters.
  const undoStackRef = useRef<UndoAction[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['xml', 'xsl'])); // Track which folders are expanded
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    if (contextMenu.show) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.show]);

  // Load "don't ask me again" preference for delete confirmations
  useEffect(() => {
    window.electronAPI.getSkipDeleteConfirm().then(setSkipDeleteConfirm);
  }, []);

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

  // Focus input when renaming folder
  useEffect(() => {
    if (renamingFolder && renameFolderInputRef.current) {
      renameFolderInputRef.current.focus();
      renameFolderInputRef.current.select();
    }
  }, [renamingFolder]);

  // Record an undoable operation (Ctrl+Z), capping history so it can't grow unbounded
  const pushUndo = (action: UndoAction) => {
    undoStackRef.current = [...undoStackRef.current, action].slice(-20);
  };

  // Delete a file or folder, showing a toast and refreshing the tree on success
  const performDelete = async (filePath: string, fileName: string, isFolder?: boolean) => {
    try {
      if (isFolder) {
        const result = await window.electronAPI.deleteFolder(workspace.path, filePath);
        if (result.success) {
          onFilesChanged();
          showToast(`Deleted folder "${fileName}"`, 'success');
        }
      } else {
        // Back up the file's content so the delete can be undone with Ctrl+Z
        let contentBackup: string | null = null;
        try {
          const fullPath = `${workspace.path}\\${filePath.replace(/\//g, '\\')}`;
          contentBackup = await window.electronAPI.readFile(fullPath);
        } catch {
          // If we can't read it, undo just won't be available for this delete
        }

        const result = await window.electronAPI.deleteFile(workspace.path, filePath);
        if (result.success) {
          onFileDeleted(filePath);
          onFilesChanged();
          showToast(`Deleted "${fileName}"`, 'success');
          if (contentBackup !== null) {
            pushUndo({ type: 'delete-file', filePath, fileName, content: contentBackup });
          }
        }
      }
    } catch (error: any) {
      console.error(`Error deleting ${isFolder ? 'folder' : 'file'}:`, error);
      const message = error.message || `Failed to delete ${isFolder ? 'folder' : 'file'}`;
      setError(message);
      showToast(message, 'error');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Delete a file/folder immediately if the user opted out of confirmations, otherwise show the dialog
  const requestDelete = (filePath: string, fileName: string, isFolder?: boolean) => {
    if (skipDeleteConfirm) {
      performDelete(filePath, fileName, isFolder);
    } else {
      setDeleteConfirm({ show: true, filePath, fileName, isFolder });
    }
  };

  // Delete multiple selected files at once, showing a single confirmation (unless skipped)
  const requestBulkDelete = (filePaths: string[]) => {
    if (filePaths.length <= 1) {
      const filePath = filePaths[0];
      if (filePath) requestDelete(filePath, filePath.split('/').pop() || filePath, false);
      return;
    }
    if (skipDeleteConfirm) {
      filePaths.forEach(filePath => performDelete(filePath, filePath.split('/').pop() || filePath, false));
      setSelectedFiles(new Set());
    } else {
      setDeleteConfirm({ show: true, filePath: '', fileName: `${filePaths.length} files`, isFolder: false, bulkPaths: filePaths });
    }
  };

  // Copy currently selected file(s) to the in-app clipboard
  const handleCopy = (filePaths: string[]) => {
    if (filePaths.length === 0) return;
    setClipboard(filePaths);
    showToast(filePaths.length > 1 ? `Copied ${filePaths.length} files` : `Copied "${filePaths[0].split('/').pop()}"`, 'success');
  };

  // Paste the clipboard's files into the given destination folder (e.g. "xml" or "xml/sub")
  const handlePaste = async (destFolderPath: string) => {
    if (!clipboard || clipboard.length === 0) return;
    try {
      let pastedCount = 0;
      for (const sourcePath of clipboard) {
        const result = await window.electronAPI.copyFile(workspace.path, sourcePath, destFolderPath);
        if (result.success) pastedCount++;
      }
      // Make sure the destination folder is visible so the pasted file(s) show up
      setExpandedFolders(prev => new Set(prev).add(destFolderPath));
      onFilesChanged();
      showToast(pastedCount > 1 ? `Pasted ${pastedCount} files` : `Pasted file`, 'success');
    } catch (error: any) {
      const message = error.message || 'Failed to paste file';
      showToast(message, 'error');
    }
  };

  // Handle a click on a file tree item, supporting Ctrl/Cmd toggle and Shift range multi-select
  const handleFileItemClick = (e: React.MouseEvent, fullPath: string) => {
    if (e.shiftKey && selectedFile) {
      const order = visibleFilesOrder.current;
      const anchorIndex = order.indexOf(selectedFile);
      const targetIndex = order.indexOf(fullPath);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        setSelectedFiles(new Set(order.slice(start, end + 1)));
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(fullPath)) {
          next.delete(fullPath);
        } else {
          next.add(fullPath);
        }
        return next;
      });
      setSelectedFile(fullPath);
      return;
    }

    setSelectedFiles(new Set([fullPath]));
    setSelectedFile(fullPath);
    onFileClick(fullPath);
  };

  // Reverse the most recent undoable operation (rename or single-file delete)
  const performUndo = async (action: UndoAction) => {
    try {
      if (action.type === 'rename-file') {
        const originalName = action.oldPath.split('/').pop() || '';
        const result = await window.electronAPI.renameFile(workspace.path, action.newPath, originalName);
        if (result.success) {
          onFileRenamed(action.newPath, result.newPath);
          onFilesChanged();
          showToast(`Undid rename to "${originalName}"`, 'success');
        }
      } else if (action.type === 'rename-folder') {
        const originalName = action.oldPath.split('/').pop() || '';
        const result = await window.electronAPI.renameFolder(workspace.path, action.newPath, originalName);
        if (result.success) {
          setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(result.oldPath)) {
              next.delete(result.oldPath);
              next.add(result.newPath);
            }
            return next;
          });
          onFilesChanged();
          showToast(`Undid folder rename to "${originalName}"`, 'success');
        }
      } else if (action.type === 'delete-file') {
        const fullPath = `${workspace.path}\\${action.filePath.replace(/\//g, '\\')}`;
        await window.electronAPI.saveFile(fullPath, action.content);
        onFilesChanged();
        showToast(`Restored "${action.fileName}"`, 'success');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to undo', 'error');
    }
  };

  const handleUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const action = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    performUndo(action);
  };

  // Keyboard shortcuts (Delete, F5, Copy/Paste, Undo)
  useEffect(() => {
    // Guard the new clipboard/undo shortcuts from hijacking text editing (Monaco editor,
    // inputs, textareas, contenteditable) elsewhere in the app.
    const isTypingElsewhere = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest?.('.monaco-editor')));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (isCreatingFile || isCreatingFolder || renamingFile || renamingFolder) return;

      // Delete key - delete selected file(s)
      if (e.key === 'Delete' && (selectedFiles.size > 0 || selectedFile)) {
        e.preventDefault();
        if (selectedFiles.size > 1) {
          requestBulkDelete(Array.from(selectedFiles));
        } else if (selectedFile) {
          const fileName = selectedFile.split('/').pop() || selectedFile;
          requestDelete(selectedFile, fileName);
        }
      }

      // F5 key - refresh workspace
      if (e.key === 'F5') {
        e.preventDefault();
        onFilesChanged();
      }

      if (isTypingElsewhere()) return;

      // Ctrl/Cmd+C - copy selected file(s) to the in-app clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const filesToCopy = selectedFiles.size > 0 ? Array.from(selectedFiles) : selectedFile ? [selectedFile] : [];
        if (filesToCopy.length > 0) {
          e.preventDefault();
          handleCopy(filesToCopy);
        }
      }

      // Ctrl/Cmd+V - paste clipboard files into the folder containing the selected file
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard && selectedFile) {
        e.preventDefault();
        const destFolder = selectedFile.substring(0, selectedFile.lastIndexOf('/'));
        if (destFolder) handlePaste(destFolder);
      }

      // Ctrl/Cmd+Z - undo the last rename/delete operation
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && undoStackRef.current.length > 0) {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, selectedFiles, isCreatingFile, isCreatingFolder, renamingFile, onFilesChanged, skipDeleteConfirm, clipboard]);

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
    // Preserve an existing multi-selection if right-clicking a file that's part of it;
    // otherwise collapse selection to just this file, like most file explorers.
    if (!selectedFiles.has(filePath)) {
      setSelectedFiles(new Set([filePath]));
      setSelectedFile(filePath);
    }
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

  const handlePasteClick = () => {
    const targetFolder = contextMenu.folderPath;
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    if (targetFolder) handlePaste(targetFolder);
  };

  const handleCopyClick = () => {
    const filesToCopy = selectedFiles.size > 1 && contextMenu.filePath && selectedFiles.has(contextMenu.filePath)
      ? Array.from(selectedFiles)
      : contextMenu.filePath ? [contextMenu.filePath] : [];
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    handleCopy(filesToCopy);
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

  const handleRenameFolderClick = () => {
    const folderPath = contextMenu.folderPath;
    setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    if (folderPath) {
      setRenamingFolder(folderPath);
      const folderName = folderPath.split('/').pop() || '';
      setNewFolderName(folderName);
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
        showToast(`Renamed to "${newFileName}"`, 'success');
        pushUndo({ type: 'rename-file', oldPath: result.oldPath, newPath: result.newPath });
      }
    } catch (err: any) {
      const message = err.message || 'Failed to rename file';
      setError(message);
      showToast(message, 'error');
    }
  };

  const handleRenameFolder = async () => {
    if (!newFolderName.trim() || !renamingFolder) {
      setError('Folder name cannot be empty');
      return;
    }

    try {
      const result = await window.electronAPI.renameFolder(workspace.path, renamingFolder, newFolderName);
      if (result.success) {
        // Update expanded folders if this folder was expanded
        setExpandedFolders(prev => {
          const next = new Set(prev);
          if (next.has(result.oldPath)) {
            next.delete(result.oldPath);
            next.add(result.newPath);
          }
          // Update any child folder paths that were expanded
          for (const expandedPath of Array.from(next)) {
            if (expandedPath.startsWith(result.oldPath + '/')) {
              next.delete(expandedPath);
              const newPath = expandedPath.replace(result.oldPath, result.newPath);
              next.add(newPath);
            }
          }
          return next;
        });

        // Reset state
        setRenamingFolder(null);
        setNewFolderName('');
        setError('');
        
        // Refresh file list
        onFilesChanged();
        showToast(`Renamed to "${newFolderName}"`, 'success');
        pushUndo({ type: 'rename-folder', oldPath: result.oldPath, newPath: result.newPath });
      }
    } catch (err: any) {
      const message = err.message || 'Failed to rename folder';
      setError(message);
      showToast(message, 'error');
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

  const handleRenameFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameFolder();
    } else if (e.key === 'Escape') {
      setRenamingFolder(null);
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

  const handleCancelRenameFolder = () => {
    setTimeout(() => {
      setRenamingFolder(null);
      setNewFolderName('');
      setError('');
    }, 200);
  };

  const handleDeleteClick = () => {
    if (contextMenu.filePath) {
      if (selectedFiles.size > 1 && selectedFiles.has(contextMenu.filePath)) {
        requestBulkDelete(Array.from(selectedFiles));
      } else {
        const fileName = contextMenu.filePath.split('/').pop() || contextMenu.filePath;
        requestDelete(contextMenu.filePath, fileName, false);
      }
      setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    }
  };

  const handleDeleteFolderClick = () => {
    if (contextMenu.folderPath) {
      const folderName = contextMenu.folderPath.split('/').pop() || contextMenu.folderPath;
      requestDelete(contextMenu.folderPath, folderName, true);
      setContextMenu({ show: false, x: 0, y: 0, folderPath: null, filePath: null, type: 'folder', rootFolder: null });
    }
  };

  const handleDeleteConfirm = async (skipNextTime?: boolean) => {
    if (skipNextTime) {
      setSkipDeleteConfirm(true);
      window.electronAPI.setSkipDeleteConfirm(true);
    }
    if (deleteConfirm.bulkPaths && deleteConfirm.bulkPaths.length > 1) {
      await Promise.all(deleteConfirm.bulkPaths.map(filePath =>
        performDelete(filePath, filePath.split('/').pop() || filePath, false)
      ));
      setSelectedFiles(new Set());
    } else {
      await performDelete(deleteConfirm.filePath, deleteConfirm.fileName, deleteConfirm.isFolder);
    }
    setDeleteConfirm({ show: false, filePath: '', fileName: '' });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, filePath: '', fileName: '' });
  };

  // Pick an icon based on file extension so different file types are visually distinct
  const getFileIcon = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xml':
        return '📰';
      case 'xsl':
      case 'xslt':
        return '🎨';
      case 'pdf':
        return '📕';
      case 'json':
        return '🗂️';
      case 'txt':
      case 'md':
        return '📝';
      default:
        return '📄';
    }
  };

  // Recursive function to render file tree
  const renderFileTree = (items: FileTreeItem[], rootFolder: 'xml' | 'xsl', parentPath: string = rootFolder, depth: number = 1) => {
    return items.map((item) => {
      const fullPath = `${parentPath}/${item.path}`;
      const paddingLeft = `${(depth + 1) * 14}px`;

      if (item.type === 'folder') {
        const isExpanded = expandedFolders.has(fullPath);
        
        // Show inline rename input for folder
        if (renamingFolder === fullPath) {
          return (
            <div key={fullPath}>
              <div className="file-tree-item file-create" style={{ paddingLeft }}>
                <span className="folder-icon">📁</span>
                <input
                  ref={renameFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleRenameFolderKeyDown}
                  onBlur={handleCancelRenameFolder}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="file-name-input"
                />
                {error && <div className="file-create-error">{error}</div>}
              </div>
            </div>
          );
        }
        
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
                <span className="file-icon">{getFileIcon(newFileName || rootFolder)}</span>
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
        // File - use fullPath which already includes parent path
        visibleFilesOrder.current.push(fullPath);

        if (renamingFile === fullPath) {
          return (
            <div key={fullPath} className="file-tree-item file-create" style={{ paddingLeft }}>
              <span className="file-icon">{getFileIcon(newFileName || renamingFile)}</span>
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
            key={fullPath}
            className={`file-tree-item ${selectedFiles.has(fullPath) ? 'selected' : ''}`}
            style={{ paddingLeft }}
            onClick={(e) => handleFileItemClick(e, fullPath)}
            onContextMenu={(e) => handleFileContextMenu(e, fullPath, rootFolder)}
          >
            <span className="file-icon">{getFileIcon(item.name)}</span> {item.name}
          </div>
        );
      }
    });
  };

  // Reset the visible-file order tracked for Shift-click range selection; repopulated
  // synchronously below as renderFileTree walks the (expanded) xml/xsl trees.
  visibleFilesOrder.current = [];

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
            <span className="file-icon">{getFileIcon(newFileName || 'xml')}</span>
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
            <span className="file-icon">{getFileIcon(newFileName || 'xsl')}</span>
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
              {clipboard && clipboard.length > 0 && (
                <div className="context-menu-item" onClick={handlePasteClick}>
                  {clipboard.length > 1 ? `Paste ${clipboard.length} Files` : 'Paste'}
                </div>
              )}
              {/* Show Rename and Delete only for non-root folders */}
              {contextMenu.folderPath !== 'xml' && contextMenu.folderPath !== 'xsl' && (
                <>
                  <div className="context-menu-item" onClick={handleRenameFolderClick}>
                    Rename
                  </div>
                  <div className="context-menu-item" onClick={handleDeleteFolderClick}>
                    Delete Folder
                  </div>
                </>
              )}
            </>
          )}
          {contextMenu.type === 'file' && (
            <>
              <div className="context-menu-item" onClick={handleCopyClick}>
                {selectedFiles.size > 1 && contextMenu.filePath && selectedFiles.has(contextMenu.filePath)
                  ? `Copy ${selectedFiles.size} Files`
                  : 'Copy'}
              </div>
              {!(selectedFiles.size > 1 && contextMenu.filePath && selectedFiles.has(contextMenu.filePath)) && (
                <div className="context-menu-item" onClick={handleRenameClick}>
                  Rename
                </div>
              )}
              <div className="context-menu-item" onClick={handleDeleteClick}>
                {selectedFiles.size > 1 && contextMenu.filePath && selectedFiles.has(contextMenu.filePath)
                  ? `Delete ${selectedFiles.size} Files`
                  : 'Delete'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        show={deleteConfirm.show}
        title={
          deleteConfirm.bulkPaths && deleteConfirm.bulkPaths.length > 1
            ? "Delete Files"
            : deleteConfirm.isFolder ? "Delete Folder" : "Delete File"
        }
        message={
          deleteConfirm.bulkPaths && deleteConfirm.bulkPaths.length > 1
            ? `Are you sure you want to delete ${deleteConfirm.bulkPaths.length} selected files?`
            : deleteConfirm.isFolder
              ? `Are you sure you want to delete folder '${deleteConfirm.fileName}' and all its contents?`
              : `Are you sure you want to delete '${deleteConfirm.fileName}'?`
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDestructive={true}
        showSkipOption={true}
      />
    </div>
  );
};
