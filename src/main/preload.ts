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
  generatePdf: (xmlPath: string, xslPath: string, xslFolder: string) => ipcRenderer.invoke('generate-pdf', xmlPath, xslPath, xslFolder),
  onGenerationLog: (callback: (log: string) => void) => {
    ipcRenderer.on('generation-log', (_event, log) => callback(log));
  },

  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  onUpdateProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update-progress', (_event, progress) => callback(progress));
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error));
  },

  // File watcher functions
  startFileWatcher: (workspacePath: string) => ipcRenderer.invoke('start-file-watcher', workspacePath),
  stopFileWatcher: (workspacePath: string) => ipcRenderer.invoke('stop-file-watcher', workspacePath),
  onFileChanged: (callback: (data: { workspacePath: string, filePath: string }) => void) => {
    ipcRenderer.on('file-changed', (_event, data) => callback(data));
  },

  // Global settings functions
  getGlobalSettings: () => ipcRenderer.invoke('get-global-settings'),
  saveLastOpenedWorkspaces: (workspacePaths: string[]) => ipcRenderer.invoke('save-last-opened-workspaces', workspacePaths),
  addRecentWorkspace: (workspacePath: string) => ipcRenderer.invoke('add-recent-workspace', workspacePath),
  getRecentWorkspaces: () => ipcRenderer.invoke('get-recent-workspaces'),
  onRestoreWorkspaces: (callback: (workspacePaths: string[]) => void) => {
    ipcRenderer.on('restore-workspaces', (_event, workspacePaths) => callback(workspacePaths));
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
