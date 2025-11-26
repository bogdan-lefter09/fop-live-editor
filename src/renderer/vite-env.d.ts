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
    onGenerationLog: (callback: (log: string) => void) => void;
    
    // Update functions
    checkForUpdates?: () => Promise<{ available: boolean; updateInfo?: any; message?: string; error?: string }>;
    downloadUpdate?: () => Promise<{ success: boolean; error?: string; message?: string }>;
    quitAndInstall?: () => void;
    onUpdateAvailable?: (callback: (info: any) => void) => void;
    onUpdateDownloaded?: (callback: (info: any) => void) => void;
    onUpdateProgress?: (callback: (progress: any) => void) => void;
    onUpdateError?: (callback: (error: string) => void) => void;
  };
}
