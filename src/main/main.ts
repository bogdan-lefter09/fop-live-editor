import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';
import chokidar from 'chokidar';
import Store from 'electron-store';
import * as ops from './workspaceOps';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Test seams: E2E tests run the built renderer (no Vite dev server) with an isolated settings directory.
const isE2E = process.env.FOP_EDITOR_E2E === '1';
if (process.env.FOP_EDITOR_USER_DATA) {
  app.setPath('userData', process.env.FOP_EDITOR_USER_DATA);
}

let mainWindow: BrowserWindow | null = null;
let fopServerProcess: ChildProcess | null = null;
let fopServerReady = false;
let pendingRequests: Map<number, PendingRequest> = new Map();
let requestIdCounter = 0;

// Global settings store
const store = new Store({
  defaults: {
    lastOpenedWorkspaces: [],
    recentWorkspaces: [],
    maxRecentWorkspaces: 10,
    skipDeleteConfirm: false,
    fopConfig: {
      useBundled: true,
      customFopPath: null
    },
    jreConfig: {
      useBundled: true,
      customJrePath: null
    }
  }
});

// Track file watchers per workspace
const workspaceWatchers: Map<string, { watcher: chokidar.FSWatcher, debounceTimer: NodeJS.Timeout | null }> = new Map();

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

  if (isDev && !isE2E) {
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

  // Create application menu
  createApplicationMenu();
}

function createApplicationMenu() {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Workspace',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-workspace');
            }
          }
        },
        {
          label: 'Open Folder as Workspace',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-folder');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Choose FOP version',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-choose-fop-version');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();

  // Start FOP server on app startup; a missing FOP/JRE must not break the rest of the app
  try {
    startFopServer();
  } catch (error) {
    console.error('Failed to start FOP server:', error);
  }

  // Check for updates
  if (!isE2E) {
    setupAutoUpdater();
  }

  // Restore last opened workspaces
  setTimeout(() => {
    restoreLastOpenedWorkspaces();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopFopServer(); // Stop FOP server on app quit
  stopAllWatchers(); // Stop all file watchers
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopFopServer();
  stopAllWatchers();
});

// Restore last opened workspaces from settings
function restoreLastOpenedWorkspaces() {
  const lastOpenedWorkspaces = store.get('lastOpenedWorkspaces', []) as string[];
  
  if (lastOpenedWorkspaces.length > 0 && mainWindow) {
    console.log('Restoring last opened workspaces:', lastOpenedWorkspaces);
    mainWindow.webContents.send('restore-workspaces', lastOpenedWorkspaces);
  }
}

// Stop all file watchers
function stopAllWatchers() {
  console.log('Stopping all file watchers...');
  workspaceWatchers.forEach((watcherData) => {
    if (watcherData.debounceTimer) {
      clearTimeout(watcherData.debounceTimer);
    }
    watcherData.watcher.close();
  });
  workspaceWatchers.clear();
}

// FOP Server Management
function startFopServer() {
  if (fopServerProcess) {
    console.log('FOP server already running');
    return;
  }

  const paths = getFopPaths();
  const serverDir = paths.serverDir; // Use the provided server directory

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
    '-Djavax.xml.accessExternalDTD=all',
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

function waitForFopServer(timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fopServerReady && fopServerProcess) {
      resolve();
      return;
    }

    // If the server process is dead, restart it
    if (!fopServerProcess) {
      console.log('FOP server process not running, restarting...');
      startFopServer();
    }

    const pollInterval = 250;
    let elapsed = 0;

    const timer = setInterval(() => {
      if (fopServerReady && fopServerProcess) {
        clearInterval(timer);
        resolve();
      } else {
        elapsed += pollInterval;
        if (elapsed >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('FOP server failed to start within ' + (timeoutMs / 1000) + ' seconds'));
        }
      }
    }, pollInterval);
  });
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
function getFopPaths() {
  const fopConfig = store.get('fopConfig') as any;
  const jreConfig = store.get('jreConfig') as any;
  
  // Always get bundled resources path for server components
  let bundledResourcesPath: string;
  if (process.env.FOP_EDITOR_BUNDLED_DIR) {
    bundledResourcesPath = process.env.FOP_EDITOR_BUNDLED_DIR;
  } else if (isDev) {
    bundledResourcesPath = path.join(app.getAppPath(), 'assets/bundled');
  } else {
    bundledResourcesPath = path.join(process.resourcesPath, 'bundled');
  }

  const javaExe = (!jreConfig.useBundled && jreConfig.customJrePath)
    ? path.join(jreConfig.customJrePath, 'bin/java.exe')
    : path.join(bundledResourcesPath, 'jre/bin/java.exe');
  
  if (!fopConfig.useBundled && fopConfig.customFopPath) {
    // Use custom FOP installation with (possibly custom) Java and bundled server
    return {
      javaExe,
      fopJar: path.join(fopConfig.customFopPath, 'build/fop-2.11.jar'),
      fopDir: fopConfig.customFopPath,
      serverDir: path.join(bundledResourcesPath, 'fop/server'), // Always use bundled server
    };
  }
  
  // Use bundled FOP installation
  return {
    javaExe,
    fopJar: path.join(bundledResourcesPath, 'fop/build/fop-2.11.jar'),
    fopDir: path.join(bundledResourcesPath, 'fop'),
    serverDir: path.join(bundledResourcesPath, 'fop/server'),
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
    return ops.getFilesRecursive(folderPath, extension);
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

// Scan workspace files
ipcMain.handle('scan-workspace-files', async (_event, workspacePath: string) => {
  try {
    return ops.scanWorkspaceFiles(workspacePath);
  } catch (error) {
    console.error('Error scanning workspace files:', error);
    return { xml: [], xsl: [] };
  }
});

// Create workspace (in dev mode, example files are copied into the new workspace)
ipcMain.handle('create-workspace', async (_event, parentFolder: string, workspaceName: string) => {
  try {
    return ops.createWorkspace(parentFolder, workspaceName, isDev ? path.join(__dirname, '../examples') : undefined);
  } catch (error: any) {
    console.error('Error in create-workspace:', error);
    throw error;
  }
});

// Open existing folder as workspace
ipcMain.handle('open-folder-as-workspace', async (_event, folderPath: string) => {
  try {
    return ops.openFolderAsWorkspace(folderPath);
  } catch (error: any) {
    console.error('Error in open-folder-as-workspace:', error);
    throw error;
  }
});

// Load workspace settings
ipcMain.handle('load-workspace-settings', async (_event, workspacePath: string) => {
  try {
    return ops.loadWorkspaceSettings(workspacePath);
  } catch (error: any) {
    console.error('Error in load-workspace-settings:', error);
    throw error;
  }
});

// Save workspace settings
ipcMain.handle('save-workspace-settings', async (_event, workspacePath: string, settings: any) => {
  try {
    return ops.saveWorkspaceSettings(workspacePath, settings);
  } catch (error: any) {
    console.error('Error in save-workspace-settings:', error);
    throw error;
  }
});

// Create new file
ipcMain.handle('create-file', async (_event, workspacePath: string, folderName: string, fileName: string) => {
  try {
    return ops.createFile(workspacePath, folderName, fileName);
  } catch (error: any) {
    console.error('Error in create-file:', error);
    throw error;
  }
});

// Copy a file into a destination folder, auto-renaming to avoid overwriting an existing file
ipcMain.handle('copy-file', async (_event, workspacePath: string, sourceRelativePath: string, destFolderRelativePath: string) => {
  try {
    return ops.copyFile(workspacePath, sourceRelativePath, destFolderRelativePath);
  } catch (error: any) {
    console.error('Error in copy-file:', error);
    throw error;
  }
});

// Move a file into a different folder (used by drag-and-drop file organization)
ipcMain.handle('move-file', async (_event, workspacePath: string, sourceRelativePath: string, destFolderRelativePath: string) => {
  try {
    return ops.moveFile(workspacePath, sourceRelativePath, destFolderRelativePath);
  } catch (error: any) {
    console.error('Error in move-file:', error);
    throw error;
  }
});

// Create folder
ipcMain.handle('create-folder', async (_event, workspacePath: string, parentFolderPath: string, folderName: string) => {
  try {
    return ops.createFolder(workspacePath, parentFolderPath, folderName);
  } catch (error: any) {
    console.error('Error in create-folder:', error);
    throw error;
  }
});

// Delete folder
ipcMain.handle('delete-folder', async (_event, workspacePath: string, folderPath: string) => {
  try {
    return ops.deleteFolder(workspacePath, folderPath);
  } catch (error: any) {
    console.error('Error in delete-folder:', error);
    throw error;
  }
});

// Rename folder
ipcMain.handle('rename-folder', async (_event, workspacePath: string, oldFolderPath: string, newFolderName: string) => {
  try {
    return ops.renameFolder(workspacePath, oldFolderPath, newFolderName);
  } catch (error: any) {
    console.error('Error in rename-folder:', error);
    throw error;
  }
});

// Rename file
ipcMain.handle('rename-file', async (_event, workspacePath: string, oldRelativePath: string, newFileName: string) => {
  try {
    return ops.renameFile(workspacePath, oldRelativePath, newFileName);
  } catch (error: any) {
    console.error('Error in rename-file:', error);
    throw error;
  }
});

// Delete file (moved to the recycle bin instead of permanent deletion)
ipcMain.handle('delete-file', async (_event, workspacePath: string, filePath: string) => {
  try {
    return await ops.deleteFile(workspacePath, filePath, fullPath => shell.trashItem(fullPath));
  } catch (error: any) {
    console.error('Error in delete-file:', error);
    throw error;
  }
});

// Search workspace files
ipcMain.handle('search-workspace', async (_event, workspacePath: string, searchQuery: string, options: ops.SearchOptions) => {
  try {
    return ops.searchWorkspace(workspacePath, searchQuery, options);
  } catch (error: any) {
    console.error('Error in search-workspace:', error);
    throw error;
  }
});

// Generate PDF with FOP Server
ipcMain.handle('generate-pdf', async (_event, xmlPath: string, xslPath: string, xslFolder: string) => {
  try {
    if (!fopServerReady) {
      console.log('FOP server not ready yet, waiting...');
      if (mainWindow) {
        mainWindow.webContents.send('generation-log', 'FOP server is starting up, please wait...\n');
      }
      await waitForFopServer();
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

// File watcher management
ipcMain.handle('start-file-watcher', async (_event, workspacePath: string) => {
  try {
    // Stop existing watcher if any
    if (workspaceWatchers.has(workspacePath)) {
      const existing = workspaceWatchers.get(workspacePath);
      if (existing) {
        if (existing.debounceTimer) clearTimeout(existing.debounceTimer);
        existing.watcher.close();
      }
    }

    const xmlFolder = path.join(workspacePath, 'xml');
    const xslFolder = path.join(workspacePath, 'xsl');

    // Watch both XML and XSL folders
    const watcher = chokidar.watch([xmlFolder, xslFolder], {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    const fileDebounceTimers = new Map<string, NodeJS.Timeout>();
    let treeRefreshTimer: NodeJS.Timeout | null = null;

    const handleFileChange = (filePath: string) => {
      console.log('File changed:', filePath);
      
      // Clear existing timer for this specific file
      const existingTimer = fileDebounceTimers.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounced generation for this file
      const debounceTimer = setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('file-changed', { workspacePath, filePath });
        }
        fileDebounceTimers.delete(filePath);
      }, 500); // 500ms debounce

      fileDebounceTimers.set(filePath, debounceTimer);
    };

    // Files/folders added or removed externally should refresh the explorer tree,
    // independent of the PDF-regen debounce used for content changes.
    const handleTreeChange = (changedPath: string) => {
      console.log('File tree changed:', changedPath);

      if (treeRefreshTimer) {
        clearTimeout(treeRefreshTimer);
      }

      treeRefreshTimer = setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('workspace-files-changed', { workspacePath });
        }
        treeRefreshTimer = null;
      }, 300);
    };

    watcher
      .on('change', handleFileChange)
      .on('add', handleTreeChange)
      .on('unlink', handleTreeChange)
      .on('addDir', handleTreeChange)
      .on('unlinkDir', handleTreeChange)
      .on('error', (error) => console.error('Watcher error:', error));

    workspaceWatchers.set(workspacePath, { watcher, debounceTimer: null });
    console.log('File watcher started for:', workspacePath);

    return { success: true };
  } catch (error: any) {
    console.error('Error starting file watcher:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-file-watcher', async (_event, workspacePath: string) => {
  try {
    const watcherData = workspaceWatchers.get(workspacePath);
    if (watcherData) {
      if (watcherData.debounceTimer) {
        clearTimeout(watcherData.debounceTimer);
      }
      watcherData.watcher.close();
      workspaceWatchers.delete(workspacePath);
      console.log('File watcher stopped for:', workspacePath);
    }
    return { success: true };
  } catch (error: any) {
    console.error('Error stopping file watcher:', error);
    return { success: false, error: error.message };
  }
});

// Global settings management
ipcMain.handle('get-global-settings', async () => {
  return {
    lastOpenedWorkspaces: store.get('lastOpenedWorkspaces', []),
    recentWorkspaces: store.get('recentWorkspaces', [])
  };
});

ipcMain.handle('save-last-opened-workspaces', async (_event, workspacePaths: string[]) => {
  store.set('lastOpenedWorkspaces', workspacePaths);
  return { success: true };
});

ipcMain.handle('add-recent-workspace', async (_event, workspacePath: string) => {
  const recentWorkspaces = store.get('recentWorkspaces', []) as string[];
  const maxRecent = store.get('maxRecentWorkspaces', 10) as number;

  // Remove if already exists
  const filtered = recentWorkspaces.filter(p => p !== workspacePath);
  
  // Add to beginning
  filtered.unshift(workspacePath);
  
  // Limit to max
  const limited = filtered.slice(0, maxRecent);
  
  store.set('recentWorkspaces', limited);
  return { success: true };
});

ipcMain.handle('get-recent-workspaces', async () => {
  const recentWorkspaces = store.get('recentWorkspaces', []) as string[];
  
  // Filter out workspaces that no longer exist
  const existing = recentWorkspaces.filter(workspacePath => {
    const configPath = path.join(workspacePath, '.fop-editor-workspace.json');
    return fs.existsSync(configPath);
  });
  
  // Update store if any were filtered out
  if (existing.length !== recentWorkspaces.length) {
    store.set('recentWorkspaces', existing);
  }
  
  return existing;
});

// Delete confirmation preference ("don't ask me again")
ipcMain.handle('get-skip-delete-confirm', async () => {
  return store.get('skipDeleteConfirm', false);
});

ipcMain.handle('set-skip-delete-confirm', async (_event, value: boolean) => {
  store.set('skipDeleteConfirm', value);
  return { success: true };
});

// FOP Settings handlers
ipcMain.handle('get-fop-settings', async () => {
  const fopConfig = store.get('fopConfig') as any;
  return {
    useBundled: fopConfig.useBundled ?? true,
    customFopPath: fopConfig.customFopPath ?? null
  };
});

ipcMain.handle('save-fop-settings', async (_event, settings: { useBundled: boolean; customFopPath?: string }) => {
  try {
    store.set('fopConfig', settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving FOP settings:', error);
    return { success: false, error: 'Failed to save settings' };
  }
});

ipcMain.handle('validate-fop-directory', async (_event, fopPath: string) => {
  return await validateFopDirectory(fopPath);
});

const validateFopDirectory = async (fopPath: string) => ops.validateFopDirectory(fopPath);

ipcMain.handle('select-fop-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select FOP Directory'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  
  // Validate the selected directory
  const validation = await validateFopDirectory(selectedPath);
  
  return {
    path: selectedPath,
    validation: validation
  };
});

// JRE Settings handlers
ipcMain.handle('get-jre-settings', async () => {
  const jreConfig = store.get('jreConfig') as any;
  return {
    useBundled: jreConfig.useBundled ?? true,
    customJrePath: jreConfig.customJrePath ?? null
  };
});

ipcMain.handle('save-jre-settings', async (_event, settings: { useBundled: boolean; customJrePath?: string }) => {
  try {
    store.set('jreConfig', settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving JRE settings:', error);
    return { success: false, error: 'Failed to save settings' };
  }
});

ipcMain.handle('validate-jre-directory', async (_event, jrePath: string) => {
  return await validateJreDirectory(jrePath);
});

const validateJreDirectory = async (jrePath: string) => ops.validateJreDirectory(jrePath);

ipcMain.handle('select-jre-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select JRE Directory'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const validation = await validateJreDirectory(selectedPath);

  return {
    path: selectedPath,
    validation: validation
  };
});

ipcMain.handle('restart-app', async () => {
  try {
    console.log('Restarting application...');
    
    // Stop FOP server and cleanup
    stopFopServer();
    stopAllWatchers();
    
    // In development mode, just quit and let the dev server restart
    if (isDev) {
      app.quit();
      return { success: true };
    }
    
    // For production, use proper relaunch
    app.relaunch();
    app.quit();
    
    return { success: true };
  } catch (error) {
    console.error('Error restarting application:', error);
    return { success: false, error: 'Failed to restart application' };
  }
});

// Auto-updater setup
function setupAutoUpdater() {
  // Enable console logging for debugging
  autoUpdater.logger = console;

  // TEMPORARILY: Allow pre-releases for testing (both dev and production)
  // TODO: Change to `autoUpdater.allowPrerelease = isDev;` after stable release
  autoUpdater.allowPrerelease = true;

  // Disable auto-download - user chooses when to download
  autoUpdater.autoDownload = false;

  // Event: Checking for updates
  autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Checking for updates...');
    console.log('Pre-release mode:', autoUpdater.allowPrerelease ? 'enabled' : 'disabled');
    console.log('Current version:', app.getVersion());
    console.log('Is dev:', isDev);
    console.log('Is packaged:', app.isPackaged);
  });

  // Event: Update not available
  autoUpdater.on('update-not-available', (info) => {
    console.log('✓ No updates available. Current version:', info.version);
  });

  // Check for updates silently on startup
  autoUpdater.checkForUpdates().catch(err => {
    console.log('❌ Update check failed:', err.message);
  });

  // When update is available, notify renderer
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    }
  });

  // When update is downloaded, notify renderer
  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      });
    }
  });

  // Error handling
  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err.message);
    }
  });

  // Download progress
  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      });
    }
  });
}

// IPC handlers for update actions
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { available: false, message: 'Updates disabled in development' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: true, updateInfo: result?.updateInfo };
  } catch (error: any) {
    return { available: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (isDev) {
    return { success: false, message: 'Updates disabled in development' };
  }

  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quit-and-install', () => {
  if (!isDev) {
    autoUpdater.quitAndInstall(false, true);
  }
});
