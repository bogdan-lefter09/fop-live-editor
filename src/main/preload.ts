import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFiles: (folderPath: string, extension: string) => ipcRenderer.invoke('get-files', folderPath, extension),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', filePath, content),
  generatePdf: (xmlPath: string, xslPath: string, xslFolder: string) => ipcRenderer.invoke('generate-pdf', xmlPath, xslPath, xslFolder),
  onGenerationLog: (callback: (log: string) => void) => {
    ipcRenderer.on('generation-log', (_event, log) => callback(log));
  },
});
