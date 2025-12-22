import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFiles: (folderPath: string, extension: string) => ipcRenderer.invoke('get-files', folderPath, extension),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', filePath, content),
  createWorkspace: (parentFolder: string, workspaceName: string) => ipcRenderer.invoke('create-workspace', parentFolder, workspaceName),
  openFolderAsWorkspace: (folderPath: string) => ipcRenderer.invoke('open-folder-as-workspace', folderPath),
  scanWorkspaceFiles: (workspacePath: string) => ipcRenderer.invoke('scan-workspace-files', workspacePath),
  loadWorkspaceSettings: (workspacePath: string) => ipcRenderer.invoke('load-workspace-settings', workspacePath),
  saveWorkspaceSettings: (workspacePath: string, settings: any) => ipcRenderer.invoke('save-workspace-settings', workspacePath, settings),
  createFile: (workspacePath: string, folderName: string, fileName: string) => ipcRenderer.invoke('create-file', workspacePath, folderName, fileName),
  createFolder: (workspacePath: string, parentFolderPath: string, folderName: string) => ipcRenderer.invoke('create-folder', workspacePath, parentFolderPath, folderName),
  deleteFolder: (workspacePath: string, folderPath: string) => ipcRenderer.invoke('delete-folder', workspacePath, folderPath),
  renameFile: (workspacePath: string, oldRelativePath: string, newFileName: string) => ipcRenderer.invoke('rename-file', workspacePath, oldRelativePath, newFileName),
  deleteFile: (workspacePath: string, filePath: string) => ipcRenderer.invoke('delete-file', workspacePath, filePath),
  searchWorkspace: (workspacePath: string, searchQuery: string, options: { caseSensitive: boolean; useRegex: boolean }) => ipcRenderer.invoke('search-workspace', workspacePath, searchQuery, options),
  generatePdf: (xmlPath: string, xslPath: string, xslFolder: string) => ipcRenderer.invoke('generate-pdf', xmlPath, xslPath, xslFolder),
  onGenerationLog: (callback: (log: string) => void) => {
    const listener = (_event: any, log: string) => callback(log);
    ipcRenderer.on('generation-log', listener);
    return () => ipcRenderer.removeListener('generation-log', listener);
  },

  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const listener = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const listener = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
  onUpdateProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
  onUpdateError: (callback: (error: string) => void) => {
    const listener = (_event: any, error: string) => callback(error);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },

  // File watcher functions
  startFileWatcher: (workspacePath: string) => ipcRenderer.invoke('start-file-watcher', workspacePath),
  stopFileWatcher: (workspacePath: string) => ipcRenderer.invoke('stop-file-watcher', workspacePath),
  onFileChanged: (callback: (data: { workspacePath: string, filePath: string }) => void) => {
    const listener = (_event: any, data: { workspacePath: string, filePath: string }) => callback(data);
    ipcRenderer.on('file-changed', listener);
    return () => ipcRenderer.removeListener('file-changed', listener);
  },

  // Global settings functions
  getGlobalSettings: () => ipcRenderer.invoke('get-global-settings'),
  saveLastOpenedWorkspaces: (workspacePaths: string[]) => ipcRenderer.invoke('save-last-opened-workspaces', workspacePaths),
  addRecentWorkspace: (workspacePath: string) => ipcRenderer.invoke('add-recent-workspace', workspacePath),
  getRecentWorkspaces: () => ipcRenderer.invoke('get-recent-workspaces'),
  onRestoreWorkspaces: (callback: (workspacePaths: string[]) => void) => {
    const listener = (_event: any, workspacePaths: string[]) => callback(workspacePaths);
    ipcRenderer.on('restore-workspaces', listener);
    return () => ipcRenderer.removeListener('restore-workspaces', listener);
  },

  // Menu event listeners
  onMenuNewWorkspace: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-new-workspace', handler);
    return () => ipcRenderer.removeListener('menu-new-workspace', handler);
  },
  onMenuOpenFolder: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open-folder', handler);
    return () => ipcRenderer.removeListener('menu-open-folder', handler);
  },
});
