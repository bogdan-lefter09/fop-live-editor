import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';
import chokidar from 'chokidar';
import Store from 'electron-store';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
    maxRecentWorkspaces: 10
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

  // Create application menu
  createApplicationMenu();
}

function createApplicationMenu() {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New PDF Workspace',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-workspace');
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
  startFopServer(); // Start FOP server on app startup

  // Check for updates
  setupAutoUpdater();

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

// Scan workspace files
ipcMain.handle('scan-workspace-files', async (_event, workspacePath: string) => {
  try {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return { xml: [], xsl: [] };
    }

    const xmlFolder = path.join(workspacePath, 'xml');
    const xslFolder = path.join(workspacePath, 'xsl');

    const xmlFiles: string[] = [];
    const xslFiles: string[] = [];

    // Scan XML folder
    if (fs.existsSync(xmlFolder)) {
      const files = fs.readdirSync(xmlFolder);
      for (const file of files) {
        const filePath = path.join(xmlFolder, file);
        if (fs.statSync(filePath).isFile() && file.endsWith('.xml')) {
          xmlFiles.push(`xml/${file}`);
        }
      }
    }

    // Scan XSL folder
    if (fs.existsSync(xslFolder)) {
      const files = fs.readdirSync(xslFolder);
      for (const file of files) {
        const filePath = path.join(xslFolder, file);
        if (fs.statSync(filePath).isFile() && (file.endsWith('.xsl') || file.endsWith('.xslt'))) {
          xslFiles.push(`xsl/${file}`);
        }
      }
    }

    return {
      xml: xmlFiles.sort(),
      xsl: xslFiles.sort()
    };
  } catch (error) {
    console.error('Error scanning workspace files:', error);
    return { xml: [], xsl: [] };
  }
});

// Create workspace
ipcMain.handle('create-workspace', async (_event, parentFolder: string, workspaceName: string) => {
  try {
    if (!parentFolder || !workspaceName) {
      throw new Error('Parent folder and workspace name are required');
    }

    // Create workspace folder
    const workspacePath = path.join(parentFolder, workspaceName);

    // Check if workspace already exists
    if (fs.existsSync(workspacePath)) {
      throw new Error('Workspace folder already exists');
    }

    // Create main workspace folder
    fs.mkdirSync(workspacePath, { recursive: true });

    // Create XML and XSL subfolders
    const xmlFolder = path.join(workspacePath, 'xml');
    const xslFolder = path.join(workspacePath, 'xsl');
    fs.mkdirSync(xmlFolder, { recursive: true });
    fs.mkdirSync(xslFolder, { recursive: true });

    // Create .fop-editor-workspace.json
    const workspaceConfig = {
      workspaceName: workspaceName,
      selectedXmlFile: null,
      selectedXslFile: null,
      autoGenerate: true,
      openFiles: []
    };
    const configPath = path.join(workspacePath, '.fop-editor-workspace.json');
    fs.writeFileSync(configPath, JSON.stringify(workspaceConfig, null, 2), 'utf-8');

    // If in dev mode, copy example files
    if (isDev) {
      // In dev mode, examples are in the project root
      // __dirname is dist-electron/, so go up one level to reach project root
      const examplesPath = path.join(__dirname, '../examples');

      if (fs.existsSync(examplesPath)) {
        const exampleXmlPath = path.join(examplesPath, 'xml');
        const exampleXslPath = path.join(examplesPath, 'xsl');

        let copiedCount = 0;

        // Copy XML files
        if (fs.existsSync(exampleXmlPath)) {
          const xmlFiles = fs.readdirSync(exampleXmlPath);
          for (const file of xmlFiles) {
            const srcPath = path.join(exampleXmlPath, file);
            const destPath = path.join(xmlFolder, file);
            if (fs.statSync(srcPath).isFile()) {
              fs.copyFileSync(srcPath, destPath);
              copiedCount++;
            }
          }
        }

        // Copy XSL files
        if (fs.existsSync(exampleXslPath)) {
          const xslFiles = fs.readdirSync(exampleXslPath);
          for (const file of xslFiles) {
            const srcPath = path.join(exampleXslPath, file);
            const destPath = path.join(xslFolder, file);
            if (fs.statSync(srcPath).isFile()) {
              fs.copyFileSync(srcPath, destPath);
              copiedCount++;
            }
          }
        }

        console.log(`Copied ${copiedCount} example files to workspace`);
      } else {
        console.log('Warning: Examples folder not found at:', examplesPath);
      }
    }

    return {
      success: true,
      workspacePath: workspacePath
    };
  } catch (error: any) {
    console.error('Error creating workspace:', error);
    throw error;
  }
});

// Load workspace settings
ipcMain.handle('load-workspace-settings', async (_event, workspacePath: string) => {
  try {
    const configPath = path.join(workspacePath, '.fop-editor-workspace.json');

    if (!fs.existsSync(configPath)) {
      // Return default settings if file doesn't exist
      return {
        workspaceName: path.basename(workspacePath),
        selectedXmlFile: '',
        selectedXslFile: '',
        autoGenerate: false,
        openFiles: []
      };
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.error('Error loading workspace settings:', error);
    throw error;
  }
});

// Save workspace settings
ipcMain.handle('save-workspace-settings', async (_event, workspacePath: string, settings: any) => {
  try {
    const configPath = path.join(workspacePath, '.fop-editor-workspace.json');
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error('Error saving workspace settings:', error);
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

    let debounceTimer: NodeJS.Timeout | null = null;

    const handleFileChange = (filePath: string) => {
      console.log('File changed:', filePath);
      
      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new debounced generation
      debounceTimer = setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('file-changed', { workspacePath, filePath });
        }
      }, 500); // 500ms debounce

      // Update the stored timer
      const watcherData = workspaceWatchers.get(workspacePath);
      if (watcherData) {
        watcherData.debounceTimer = debounceTimer;
      }
    };

    watcher
      .on('change', handleFileChange)
      .on('add', handleFileChange)
      .on('unlink', handleFileChange)
      .on('error', (error) => console.error('Watcher error:', error));

    workspaceWatchers.set(workspacePath, { watcher, debounceTimer });
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
