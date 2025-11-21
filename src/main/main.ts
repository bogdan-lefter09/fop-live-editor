import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let fopServerProcess: ChildProcess | null = null;
let fopServerReady = false;
let pendingRequests: Map<number, PendingRequest> = new Map();
let requestIdCounter = 0;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  requestId: number;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      webSecurity: false, // Allow file:// protocol access for PDF streaming
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
  startFopServer(); // Start FOP server on app startup

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopFopServer(); // Stop FOP server on app quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopFopServer();
});

// FOP Server Management
function startFopServer() {
  if (fopServerProcess) {
    console.log('FOP server already running');
    return;
  }

  const paths = getBundledPaths();
  const serverDir = path.join(paths.fopDir, 'server');
  
  // Build classpath
  const libDir = path.join(paths.fopDir, 'lib');
  const buildDir = path.join(paths.fopDir, 'build');
  
  const libJars = fs.readdirSync(libDir)
    .filter(file => file.endsWith('.jar'))
    .map(file => path.join(libDir, file));
  
  const buildJars = fs.readdirSync(buildDir)
    .filter(file => file.endsWith('.jar'))
    .map(file => path.join(buildDir, file));
  
  const gsonJar = path.join(serverDir, 'gson-2.10.1.jar');
  
  const allJars = [...buildJars, ...libJars, gsonJar];
  const classpath = allJars.join(path.delimiter) + path.delimiter + serverDir;
  
  const args = [
    '-Xms128m',
    '-Xmx512m',
    '-XX:+UseG1GC',
    '-XX:MaxGCPauseMillis=50',
    '-Djavax.xml.accessExternalStylesheet=all',
    '-Djavax.xml.accessExternalSchema=all',
    '-Dfop.fontcache=temp',
    '-cp',
    classpath,
    'FopServer'
  ];

  console.log('Starting FOP server...');
  console.log('Java:', paths.javaExe);
  console.log('Working dir:', serverDir);

  fopServerProcess = spawn(paths.javaExe, args, {
    cwd: serverDir,
    windowsHide: true,
  });

  let responseBuffer = '';

  fopServerProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    responseBuffer += text;
    
    // Process complete responses (delimited by newlines)
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.startsWith('RESPONSE:')) {
        const jsonStr = line.substring(9);
        try {
          const response = JSON.parse(jsonStr);
          handleFopServerResponse(response);
        } catch (e) {
          console.error('Failed to parse FOP response:', e);
        }
      }
    }
  });

  fopServerProcess.stderr?.on('data', (data: Buffer) => {
    console.error('FOP Server stderr:', data.toString());
  });

  fopServerProcess.on('close', (code: number) => {
    console.log(`FOP server exited with code ${code}`);
    fopServerReady = false;
    fopServerProcess = null;
    
    // Reject all pending requests
    pendingRequests.forEach(req => {
      req.reject(new Error('FOP server process terminated'));
    });
    pendingRequests.clear();
  });

  fopServerProcess.on('error', (error: Error) => {
    console.error('FOP server error:', error);
    fopServerReady = false;
  });
}

function stopFopServer() {
  if (!fopServerProcess) return;

  try {
    // Send shutdown command
    sendFopCommand({ action: 'shutdown' });
    
    // Give it a moment to shut down gracefully
    setTimeout(() => {
      if (fopServerProcess && !fopServerProcess.killed) {
        fopServerProcess.kill();
      }
    }, 1000);
  } catch (e) {
    console.error('Error stopping FOP server:', e);
    if (fopServerProcess) {
      fopServerProcess.kill();
    }
  }
  
  fopServerProcess = null;
  fopServerReady = false;
}

function sendFopCommand(command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!fopServerProcess || !fopServerReady) {
      if (command.action !== 'ping') {
        reject(new Error('FOP server not ready'));
        return;
      }
    }

    const requestId = ++requestIdCounter;
    pendingRequests.set(requestId, { resolve, reject, requestId });
    
    const commandWithId = { ...command, requestId };
    const jsonCommand = JSON.stringify(commandWithId) + '\n';
    
    fopServerProcess?.stdin?.write(jsonCommand);
  });
}

function handleFopServerResponse(response: any) {
  if (response.status === 'ready') {
    console.log('FOP server ready!');
    fopServerReady = true;
    return;
  }

  const requestId = response.requestId;
  const pending = pendingRequests.get(requestId);
  
  if (!pending) {
    console.warn('Received response for unknown request:', requestId);
    return;
  }

  pendingRequests.delete(requestId);

  if (response.status === 'error') {
    pending.reject(new Error(response.message));
  } else {
    pending.resolve(response);
  }
}

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

// Generate PDF with FOP Server
ipcMain.handle('generate-pdf', async (_event, xmlPath: string, xslPath: string, xslFolder: string) => {
  try {
    if (!fopServerReady) {
      throw new Error('FOP server is not ready. Please wait...');
    }

    const outputPdf = getOutputPdfPath();

    // Validate input files exist
    if (!fs.existsSync(xmlPath)) {
      throw new Error(`XML file not found: ${xmlPath}`);
    }
    if (!fs.existsSync(xslPath)) {
      throw new Error(`XSL file not found: ${xslPath}`);
    }

    // Send initial log
    if (mainWindow) {
      mainWindow.webContents.send('generation-log', `Starting FOP generation...\n`);
      mainWindow.webContents.send('generation-log', `XML: ${xmlPath}\n`);
      mainWindow.webContents.send('generation-log', `XSL: ${xslPath}\n`);
      mainWindow.webContents.send('generation-log', `Output: ${outputPdf}\n`);
      mainWindow.webContents.send('generation-log', `Working dir: ${xslFolder}\n\n`);
    }

    // Send generation command to FOP server
    const response = await sendFopCommand({
      action: 'generate',
      xmlPath,
      xslPath,
      outputPath: outputPdf,
      workingDir: xslFolder
    });

    if (response.status === 'success') {
      if (mainWindow) {
        mainWindow.webContents.send('generation-log', `\n✓ ${response.message}\n`);
      }

      // Return file path instead of buffer - let renderer stream it
      return {
        success: true,
        outputPath: outputPdf
      };
    } else {
      throw new Error(response.message || 'Unknown error');
    }
  } catch (error: any) {
    if (mainWindow) {
      mainWindow.webContents.send('generation-log', `\n✗ Error: ${error.message}\n`);
    }
    throw error;
  }
});
