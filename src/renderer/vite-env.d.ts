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
  };
}
