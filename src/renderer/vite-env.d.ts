/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    ping: () => Promise<string>;
    selectFolder: () => Promise<string | null>;
    getFiles: (folderPath: string, extension: string) => Promise<string[]>;
    readFile: (filePath: string) => Promise<string>;
    saveFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
    generatePdf: (xmlPath: string, xslPath: string, xslFolder: string) => Promise<{
      success: boolean;
      pdfBuffer: number[];
      outputPath: string;
      stdout: string;
      stderr: string;
    }>;
    onGenerationLog: (callback: (log: string) => void) => (() => void);

    // Workspace functions
    createWorkspace: (folderPath: string, workspaceName: string) => Promise<{
      success: boolean;
      workspacePath: string;
      message?: string;
    }>;
    openFolderAsWorkspace: (folderPath: string) => Promise<{
      success: boolean;
      workspacePath: string;
      workspaceName: string;
    }>;
    scanWorkspaceFiles: (workspacePath: string) => Promise<{
      xml: string[];
      xsl: string[];
    }>;
    loadWorkspaceSettings: (workspacePath: string) => Promise<{
      workspaceName: string;
      selectedXmlFile: string;
      selectedXslFile: string;
      autoGenerate: boolean;
      openFiles: string[];
    }>;
    saveWorkspaceSettings: (workspacePath: string, settings: any) => Promise<{
      success: boolean;
    }>;
    createFile: (workspacePath: string, folderName: string, fileName: string) => Promise<{
      success: boolean;
      filePath: string;
    }>;
    renameFile: (workspacePath: string, oldRelativePath: string, newFileName: string) => Promise<{
      success: boolean;
      oldPath: string;
      newPath: string;
    }>;
    deleteFile: (workspacePath: string, filePath: string) => Promise<{
      success: boolean;
      deletedPath: string;
    }>;
    createFolder: (workspacePath: string, parentPath: string, folderName: string) => Promise<{
      success: boolean;
      folderPath: string;
    }>;
    deleteFolder: (workspacePath: string, folderPath: string) => Promise<{
      success: boolean;
      deletedPath: string;
    }>;
    renameFolder: (workspacePath: string, oldFolderPath: string, newFolderName: string) => Promise<{
      success: boolean;
      oldPath: string;
      newPath: string;
    }>;
    searchWorkspace: (workspacePath: string, searchQuery: string, options: { caseSensitive: boolean; useRegex: boolean }) => Promise<{
      success: boolean;
      results: Array<{
        file: string;
        matches: Array<{
          line: number;
          column: number;
          text: string;
          matchText: string;
        }>;
      }>;
    }>;

    // Update functions
    checkForUpdates?: () => Promise<{ available: boolean; updateInfo?: any; message?: string; error?: string }>;
    downloadUpdate?: () => Promise<{ success: boolean; error?: string; message?: string }>;
    quitAndInstall?: () => void;
    onUpdateAvailable?: (callback: (info: any) => void) => (() => void);
    onUpdateDownloaded?: (callback: (info: any) => void) => (() => void);
    onUpdateProgress?: (callback: (progress: any) => void) => (() => void);
    onUpdateError?: (callback: (error: string) => void) => (() => void);

    // File watcher functions
    startFileWatcher: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
    stopFileWatcher: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
    onFileChanged: (callback: (data: { workspacePath: string, filePath: string }) => void) => (() => void);

    // Global settings functions
    getGlobalSettings: () => Promise<{ lastOpenedWorkspaces: string[]; recentWorkspaces: string[] }>;
    saveLastOpenedWorkspaces: (workspacePaths: string[]) => Promise<{ success: boolean }>;
    addRecentWorkspace: (workspacePath: string) => Promise<{ success: boolean }>;
    getRecentWorkspaces: () => Promise<string[]>;
    onRestoreWorkspaces: (callback: (workspacePaths: string[]) => void) => (() => void);

    // Menu event listeners
    onMenuNewWorkspace: (callback: () => void) => (() => void);
    onMenuOpenFolder: (callback: () => void) => (() => void);
  };
  electron: {
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
  };
}
