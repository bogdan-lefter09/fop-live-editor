import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let currentFopProcess: any = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      console.error('Failed to load URL:', err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // Log any errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper: Get bundled resource paths
function getBundledPaths() {
  let resourcesPath: string;
  
  if (isDev) {
    // In development, assets are in the project root
    resourcesPath = path.join(app.getAppPath(), 'assets/bundled');
  } else {
    // In production, assets are in the resources folder
    resourcesPath = path.join(process.resourcesPath, 'bundled');
  }

  return {
    javaExe: path.join(resourcesPath, 'jre/bin/java.exe'),
    fopJar: path.join(resourcesPath, 'fop/build/fop-2.11.jar'),
    fopDir: path.join(resourcesPath, 'fop'),
  };
}

// Helper: Get output PDF path
function getOutputPdfPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'output.pdf');
}

// IPC handlers
ipcMain.handle('ping', () => 'pong');

// Folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

// Get files from directory (recursively)
ipcMain.handle('get-files', async (_event, folderPath: string, extension: string) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return [];
    }
    
    const files: string[] = [];
    
    // Recursive function to search directories
    function searchDirectory(dir: string, baseDir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          searchDirectory(fullPath, baseDir);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          // Get relative path from base folder
          const relativePath = path.relative(baseDir, fullPath);
          files.push(relativePath);
        }
      }
    }
    
    searchDirectory(folderPath, folderPath);
    
    // Sort files alphabetically
    return files.sort();
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

// Read file content
ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});

// Save file content
ipcMain.handle('save-file', async (_event, filePath: string, content: string) => {
  try {
    if (!filePath) {
      throw new Error('File path is required');
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
});

// Generate PDF with FOP
ipcMain.handle('generate-pdf', async (_event, xmlPath: string, xslPath: string, xslFolder: string) => {
  return new Promise((resolve, reject) => {
    try {
      // Kill previous process if running
      if (currentFopProcess) {
        currentFopProcess.kill();
        currentFopProcess = null;
      }

      const paths = getBundledPaths();
      const outputPdf = getOutputPdfPath();

      // Validate bundled resources exist
      if (!fs.existsSync(paths.javaExe)) {
        reject(new Error(`Java not found at: ${paths.javaExe}`));
        return;
      }
      if (!fs.existsSync(paths.fopJar)) {
        reject(new Error(`FOP not found at: ${paths.fopJar}`));
        return;
      }
      if (!fs.existsSync(xmlPath)) {
        reject(new Error(`XML file not found: ${xmlPath}`));
        return;
      }
      if (!fs.existsSync(xslPath)) {
        reject(new Error(`XSL file not found: ${xslPath}`));
        return;
      }

      // Build classpath (include fop.jar and all lib jars)
      const libDir = path.join(paths.fopDir, 'lib');
      const buildDir = path.join(paths.fopDir, 'build');
      
      // Get all jars from lib directory
      const libJars = fs.readdirSync(libDir)
        .filter(file => file.endsWith('.jar'))
        .map(file => path.join(libDir, file));
      
      // Get all jars from build directory
      const buildJars = fs.readdirSync(buildDir)
        .filter(file => file.endsWith('.jar'))
        .map(file => path.join(buildDir, file));
      
      // Combine all jars into classpath
      const allJars = [...buildJars, ...libJars];
      const classpath = allJars.join(path.delimiter);
      
      // Build FOP command
      const args = [
        '-Djavax.xml.accessExternalStylesheet=all', // Allow external stylesheet access
        '-Djavax.xml.accessExternalSchema=all', // Allow external schema access
        '-cp',
        classpath,
        'org.apache.fop.cli.Main',
        '-xml',
        xmlPath,
        '-xsl',
        xslPath,
        '-pdf',
        outputPdf
      ];

      // Send initial log
      if (mainWindow) {
        mainWindow.webContents.send('generation-log', `Starting FOP generation...\n`);
        mainWindow.webContents.send('generation-log', `Java: ${paths.javaExe}\n`);
        mainWindow.webContents.send('generation-log', `FOP: ${paths.fopJar}\n`);
        mainWindow.webContents.send('generation-log', `XML: ${xmlPath}\n`);
        mainWindow.webContents.send('generation-log', `XSL: ${xslPath}\n`);
        mainWindow.webContents.send('generation-log', `Output: ${outputPdf}\n`);
        mainWindow.webContents.send('generation-log', `Working dir: ${xslFolder}\n\n`);
      }

      // Spawn FOP process
      currentFopProcess = spawn(paths.javaExe, args, {
        cwd: xslFolder, // Set working directory to XSL folder for relative imports
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      // Capture stdout
      currentFopProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        if (mainWindow) {
          mainWindow.webContents.send('generation-log', text);
        }
      });

      // Capture stderr
      currentFopProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        if (mainWindow) {
          mainWindow.webContents.send('generation-log', text);
        }
      });

      // Handle process exit
      currentFopProcess.on('close', (code: number) => {
        currentFopProcess = null;

        if (code === 0) {
          // Success - read PDF and send to renderer
          try {
            if (fs.existsSync(outputPdf)) {
              const pdfBuffer = fs.readFileSync(outputPdf);
              if (mainWindow) {
                mainWindow.webContents.send('generation-log', `\n✓ PDF generated successfully!\n`);
              }
              resolve({
                success: true,
                pdfBuffer: Array.from(pdfBuffer),
                outputPath: outputPdf,
                stdout,
                stderr
              });
            } else {
              reject(new Error('PDF file was not created'));
            }
          } catch (error) {
            reject(error);
          }
        } else {
          // Error
          const errorMsg = `FOP process exited with code ${code}\n${stderr}`;
          if (mainWindow) {
            mainWindow.webContents.send('generation-log', `\n✗ Generation failed: ${errorMsg}\n`);
          }
          reject(new Error(errorMsg));
        }
      });

      // Handle process errors
      currentFopProcess.on('error', (error: Error) => {
        currentFopProcess = null;
        if (mainWindow) {
          mainWindow.webContents.send('generation-log', `\n✗ Process error: ${error.message}\n`);
        }
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
});
