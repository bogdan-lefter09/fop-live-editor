import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'

interface Workspace {
  id: string;
  name: string;
  path: string;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  originalContent: string;
}

function App() {
  // State for workspaces
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [showWorkspaceForm, setShowWorkspaceForm] = useState<boolean>(false)

  // Workspace form state
  const [workspaceFolder, setWorkspaceFolder] = useState<string>('')
  const [workspaceName, setWorkspaceName] = useState<string>('')

  // UI state for active workspace
  const [showFileExplorer, setShowFileExplorer] = useState<boolean>(true)
  const [showSearch, setShowSearch] = useState<boolean>(false)

  // Files in active workspace
  const [workspaceFiles, setWorkspaceFiles] = useState<{ xml: string[], xsl: string[] }>({ xml: [], xsl: [] })

  // Toolbar state
  const [selectedXmlFile, setSelectedXmlFile] = useState<string>('')
  const [selectedXslFile, setSelectedXslFile] = useState<string>('')
  const [autoGenerate, setAutoGenerate] = useState<boolean>(false)

  // Editor state for open files
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1)
  const [editorReloadKey, setEditorReloadKey] = useState<number>(0)
  const editorRef = useRef<any>(null)

  // State for PDF preview (per workspace)
  const [workspacePdfUrls, setWorkspacePdfUrls] = useState<Map<string, string>>(new Map())

  // State for logs
  const [logs, setLogs] = useState<string>('')
  const [showLogs, setShowLogs] = useState<boolean>(false)

  // State for recent workspaces
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([])

  // State for updates
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false)
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [isDownloading, setIsDownloading] = useState<boolean>(false)

  // Load recent workspaces on mount
  useEffect(() => {
    const loadRecentWorkspaces = async () => {
      try {
        const recent = await window.electronAPI.getRecentWorkspaces();
        setRecentWorkspaces(recent);
      } catch (error) {
        console.error('Failed to load recent workspaces:', error);
      }
    };
    loadRecentWorkspaces();
  }, []);

  // Listen for generation logs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onGenerationLog((log: string) => {
        setLogs(prev => prev + log);
      });
    }
  }, []);

  // Listen for update events
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onUpdateAvailable?.((info: any) => {
        setUpdateAvailable(true);
        setUpdateInfo(info);
      });

      window.electronAPI.onUpdateDownloaded?.((_info: any) => {
        setUpdateDownloaded(true);
        setIsDownloading(false);
      });

      window.electronAPI.onUpdateProgress?.((progress: any) => {
        setDownloadProgress(progress.percent);
      });

      window.electronAPI.onUpdateError?.((error: string) => {
        console.error('Update error:', error);
        setIsDownloading(false);
      });
    }
  }, []);

  // Compute active workspace
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  // Use refs to access current state in event handlers without causing re-registration
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const openFilesRef = useRef(openFiles);
  const activeFileIndexRef = useRef(activeFileIndex);
  const autoGenerateRef = useRef(autoGenerate);
  const selectedXmlFileRef = useRef(selectedXmlFile);
  const selectedXslFileRef = useRef(selectedXslFile);

  // Keep refs up to date
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);
  useEffect(() => { activeWorkspaceRef.current = activeWorkspace; }, [activeWorkspace]);
  useEffect(() => { openFilesRef.current = openFiles; }, [openFiles]);
  useEffect(() => { activeFileIndexRef.current = activeFileIndex; }, [activeFileIndex]);
  useEffect(() => { autoGenerateRef.current = autoGenerate; }, [autoGenerate]);
  useEffect(() => { selectedXmlFileRef.current = selectedXmlFile; }, [selectedXmlFile]);
  useEffect(() => { selectedXslFileRef.current = selectedXslFile; }, [selectedXslFile]);

  // Listen for file changes (for auto-generate and editor reload)
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleFileChanged = async (data: { workspacePath: string, filePath: string }) => {
      // Check if this is the active workspace
      const workspace = workspacesRef.current.find(w => w.path === data.workspacePath);
      if (!workspace || workspace.id !== activeWorkspaceIdRef.current) return;

      // Normalize paths for comparison (handle different separators)
      const normalizedChangedPath = data.filePath.replace(/\//g, '\\').toLowerCase();
      const fileIndex = openFilesRef.current.findIndex(f => f.path.replace(/\//g, '\\').toLowerCase() === normalizedChangedPath);
      
      if (fileIndex !== -1) {
        try {
          const newContent = await window.electronAPI.readFile(data.filePath);
          
          setOpenFiles(files => {
            const updated = [...files];
            updated[fileIndex] = {
              ...updated[fileIndex],
              content: newContent,
              originalContent: newContent,
              isDirty: false
            };
            return updated;
          });
          
          // Force editor to remount with new content if this is the active file
          if (fileIndex === activeFileIndexRef.current) {
            setEditorReloadKey(prev => prev + 1);
          }
        } catch (error) {
          console.error('Failed to reload file:', error);
        }
      }

      // Auto-generate PDF if enabled and files are selected
      if (autoGenerateRef.current && activeWorkspaceRef.current && selectedXmlFileRef.current && selectedXslFileRef.current) {
        setTimeout(() => handleGeneratePDF(), 100);
      }
    };

    window.electronAPI.onFileChanged(handleFileChanged);

    // Listen for workspace restoration
    window.electronAPI.onRestoreWorkspaces(async (workspacePaths: string[]) => {
      for (const workspacePath of workspacePaths) {
        await openWorkspaceByPath(workspacePath);
      }
    });
  }, []); // Empty dependency array - only register once

  // Listen for menu events
  useEffect(() => {
    const handleNewWorkspace = () => {
      setShowWorkspaceForm(true);
    };

    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('menu-new-workspace', handleNewWorkspace);

      return () => {
        window.electron.ipcRenderer.removeListener('menu-new-workspace', handleNewWorkspace);
      };
    }
  }, []);

  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    try {
      await window.electronAPI.downloadUpdate?.();
    } catch (error) {
      console.error('Failed to download update:', error);
      setIsDownloading(false);
    }
  };

  const handleInstallUpdate = () => {
    window.electronAPI.quitAndInstall?.();
  };

  const handleBrowseFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setWorkspaceFolder(folder);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  // Open workspace by path (for restoration)
  const openWorkspaceByPath = async (workspacePath: string) => {
    try {
      // Check if workspace is already open
      const isAlreadyOpen = workspaces.some(w => w.path === workspacePath);
      if (isAlreadyOpen) {
        console.log('Workspace already open:', workspacePath);
        return;
      }

      // Load workspace settings to get name
      const settings = await window.electronAPI.loadWorkspaceSettings(workspacePath);
      
      // Create new workspace
      const newWorkspace: Workspace = {
        id: `workspace-${Date.now()}-${Math.random()}`,
        name: settings.workspaceName || workspacePath.split('\\').pop() || 'Workspace',
        path: workspacePath
      };

      setWorkspaces(prev => [...prev, newWorkspace]);
      setActiveWorkspaceId(newWorkspace.id);

      // Add to recent workspaces
      await window.electronAPI.addRecentWorkspace(workspacePath);

      // Update recent workspaces list
      const recent = await window.electronAPI.getRecentWorkspaces();
      setRecentWorkspaces(recent);

      // Start file watcher if auto-generate is enabled
      if (settings.autoGenerate) {
        await window.electronAPI.startFileWatcher(workspacePath);
      }
    } catch (error) {
      console.error('Error opening workspace:', error);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!workspaceFolder || !workspaceName.trim()) {
      alert('Please select a folder and enter a workspace name');
      return;
    }

    try {
      // Call IPC to create workspace folder structure
      const result = await window.electronAPI.createWorkspace(workspaceFolder, workspaceName);

      if (result.success) {
        // Check if workspace is already open
        const isAlreadyOpen = workspaces.some(w => w.path === result.workspacePath);

        if (isAlreadyOpen) {
          alert('This workspace is already open');
          // Reset form but don't create duplicate
          setShowWorkspaceForm(false);
          setWorkspaceFolder('');
          setWorkspaceName('');
          // Switch to existing workspace
          const existingWorkspace = workspaces.find(w => w.path === result.workspacePath);
          if (existingWorkspace) {
            setActiveWorkspaceId(existingWorkspace.id);
          }
          return;
        }

        // Create new workspace object
        const newWorkspace: Workspace = {
          id: Date.now().toString(),
          name: workspaceName,
          path: result.workspacePath
        };

        setWorkspaces([...workspaces, newWorkspace]);
        setActiveWorkspaceId(newWorkspace.id);

        // Add to recent workspaces
        await window.electronAPI.addRecentWorkspace(result.workspacePath);

        // Reset form
        setShowWorkspaceForm(false);
        setWorkspaceFolder('');
        setWorkspaceName('');
      }
    } catch (error: any) {
      alert(`Failed to create workspace: ${error.message}`);
      console.error('Error creating workspace:', error);
    }
  };

  const handleCloseWorkspace = async (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    
    if (workspace) {
      // Stop file watcher for this workspace
      try {
        await window.electronAPI.stopFileWatcher(workspace.path);
      } catch (error) {
        console.error('Failed to stop file watcher:', error);
      }
    }

    const updatedWorkspaces = workspaces.filter(w => w.id !== workspaceId);
    setWorkspaces(updatedWorkspaces);

    // If closing active workspace, switch to another or show form
    if (activeWorkspaceId === workspaceId) {
      if (updatedWorkspaces.length > 0) {
        setActiveWorkspaceId(updatedWorkspaces[0].id);
      } else {
        setActiveWorkspaceId(null);
      }
    }
  };

  // Load workspace files and settings when active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      loadWorkspaceFiles(activeWorkspace.path);
      // Note: loadWorkspaceSettings now handles restoring openFiles, so we don't clear them here
      loadWorkspaceSettings(activeWorkspace.path);
    } else {
      // Clear files when no workspace is active
      setWorkspaceFiles({ xml: [], xsl: [] });
      setSelectedXmlFile('');
      setSelectedXslFile('');
      setAutoGenerate(false);
      setOpenFiles([]);
      setActiveFileIndex(-1);
    }
  }, [activeWorkspace]);

  const loadWorkspaceFiles = async (workspacePath: string) => {
    try {
      const files = await window.electronAPI.scanWorkspaceFiles(workspacePath);
      setWorkspaceFiles(files);
    } catch (error) {
      console.error('Error loading workspace files:', error);
    }
  };

  const loadWorkspaceSettings = async (workspacePath: string) => {
    try {
      const settings = await window.electronAPI.loadWorkspaceSettings(workspacePath);
      setSelectedXmlFile(settings.selectedXmlFile || '');
      setSelectedXslFile(settings.selectedXslFile || '');
      setAutoGenerate(settings.autoGenerate || false);
      
      // Restore open files from settings
      if (settings.openFiles && settings.openFiles.length > 0) {
        const filesToOpen: OpenFile[] = [];
        for (const relativeFilePath of settings.openFiles) {
          const fullPath = `${workspacePath}\\${relativeFilePath}`;
          try {
            const content = await window.electronAPI.readFile(fullPath);
            const fileName = relativeFilePath.split(/[/\\]/).pop() || relativeFilePath;
            filesToOpen.push({
              path: fullPath,
              name: fileName,
              content: content,
              isDirty: false,
              originalContent: content
            });
          } catch (error) {
            console.error(`Failed to restore file ${relativeFilePath}:`, error);
          }
        }
        setOpenFiles(filesToOpen);
        if (filesToOpen.length > 0) {
          setActiveFileIndex(0);
        } else {
          setActiveFileIndex(-1);
        }
      } else {
        // No files to restore, clear the open files
        setOpenFiles([]);
        setActiveFileIndex(-1);
      }
    } catch (error) {
      console.error('Error loading workspace settings:', error);
      setOpenFiles([]);
      setActiveFileIndex(-1);
    }
  };

  const saveWorkspaceSettings = async () => {
    if (!activeWorkspace) return;

    try {
      const settings = {
        workspaceName: activeWorkspace.name,
        selectedXmlFile,
        selectedXslFile,
        autoGenerate,
        openFiles: openFiles.map(f => f.path.replace(activeWorkspace.path + '\\', ''))
      };
      await window.electronAPI.saveWorkspaceSettings(activeWorkspace.path, settings);
    } catch (error) {
      console.error('Error saving workspace settings:', error);
    }
  };

  // Save settings when toolbar selections change or files open/close
  useEffect(() => {
    if (activeWorkspace && (selectedXmlFile || selectedXslFile || openFiles.length > 0)) {
      saveWorkspaceSettings();
    }
  }, [selectedXmlFile, selectedXslFile, autoGenerate, openFiles]);

  // Start/stop file watcher when auto-generate changes
  useEffect(() => {
    if (activeWorkspace) {
      if (autoGenerate) {
        window.electronAPI.startFileWatcher(activeWorkspace.path)
          .then(() => console.log('File watcher started for:', activeWorkspace.path))
          .catch(err => console.error('Failed to start file watcher:', err));
      } else {
        window.electronAPI.stopFileWatcher(activeWorkspace.path)
          .then(() => console.log('File watcher stopped for:', activeWorkspace.path))
          .catch(err => console.error('Failed to stop file watcher:', err));
      }
    }
  }, [autoGenerate, activeWorkspace]);

  // Start/stop file watcher when auto-generate changes
  useEffect(() => {
    if (activeWorkspace) {
      if (autoGenerate) {
        window.electronAPI.startFileWatcher(activeWorkspace.path)
          .then(() => console.log('File watcher started for:', activeWorkspace.path))
          .catch(err => console.error('Failed to start file watcher:', err));
      } else {
        window.electronAPI.stopFileWatcher(activeWorkspace.path)
          .then(() => console.log('File watcher stopped for:', activeWorkspace.path))
          .catch(err => console.error('Failed to stop file watcher:', err));
      }
    }
  }, [autoGenerate, activeWorkspace]);

  // Save open workspaces whenever the workspace list changes
  useEffect(() => {
    const workspacePaths = workspaces.map(w => w.path);
    if (workspacePaths.length > 0) {
      window.electronAPI.saveLastOpenedWorkspaces(workspacePaths)
        .catch(err => console.error('Failed to save open workspaces:', err));
    }
  }, [workspaces]);

  const handleFileClick = async (filePath: string) => {
    if (!activeWorkspace) return;

    const fullPath = `${activeWorkspace.path}\\${filePath}`;
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    // Check if file is already open
    const existingIndex = openFiles.findIndex(f => f.path === fullPath);
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
      return;
    }

    // Load file content
    try {
      const content = await window.electronAPI.readFile(fullPath);
      const newFile: OpenFile = {
        path: fullPath,
        name: fileName,
        content: content,
        isDirty: false,
        originalContent: content
      };

      setOpenFiles([...openFiles, newFile]);
      setActiveFileIndex(openFiles.length);
    } catch (error) {
      console.error('Error loading file:', error);
      alert(`Failed to load file: ${error}`);
    }
  };

  const handleCloseFile = (index: number) => {
    const file = openFiles[index];

    // Check if file has unsaved changes
    if (file.isDirty) {
      const confirmClose = confirm(`${file.name} has unsaved changes. Close anyway?`);
      if (!confirmClose) return;
    }

    const newOpenFiles = openFiles.filter((_, i) => i !== index);
    setOpenFiles(newOpenFiles);

    // Adjust active file index
    if (activeFileIndex === index) {
      // If closing active file, switch to previous or next
      if (newOpenFiles.length === 0) {
        setActiveFileIndex(-1);
      } else if (index >= newOpenFiles.length) {
        setActiveFileIndex(newOpenFiles.length - 1);
      } else {
        setActiveFileIndex(index);
      }
    } else if (activeFileIndex > index) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileIndex === -1 || !value) return;

    const updatedFiles = [...openFiles];
    updatedFiles[activeFileIndex] = {
      ...updatedFiles[activeFileIndex],
      content: value,
      isDirty: value !== updatedFiles[activeFileIndex].originalContent
    };
    setOpenFiles(updatedFiles);
  };

  const handleSaveFile = async () => {
    if (activeFileIndex === -1) return;

    const file = openFiles[activeFileIndex];
    try {
      await window.electronAPI.saveFile(file.path, file.content);

      // Update file state
      const updatedFiles = [...openFiles];
      updatedFiles[activeFileIndex] = {
        ...file,
        isDirty: false,
        originalContent: file.content
      };
      setOpenFiles(updatedFiles);
    } catch (error) {
      console.error('Error saving file:', error);
      alert(`Failed to save file: ${error}`);
    }
  };

  // Generate PDF
  const handleGeneratePDF = async () => {
    // Use refs to access current state (important for event handlers)
    const currentWorkspace = activeWorkspaceRef.current;
    const currentXmlFile = selectedXmlFileRef.current;
    const currentXslFile = selectedXslFileRef.current;

    if (!currentWorkspace || !currentXmlFile || !currentXslFile) {
      alert('Please select both XML and XSL files');
      return;
    }

    try {
      // Clear previous logs
      setLogs('');
      setShowLogs(true);

      // Build full paths
      const xmlPath = `${currentWorkspace.path}\\${currentXmlFile}`;
      const xslPath = `${currentWorkspace.path}\\${currentXslFile}`;

      // XSL folder is the directory containing the XSL file
      const xslFolder = `${currentWorkspace.path}\\xsl`;

      // Call IPC to generate PDF
      const result = await window.electronAPI.generatePdf(xmlPath, xslPath, xslFolder);

      if (result.success) {
        // Load the generated PDF with timestamp to prevent caching
        const timestamp = new Date().getTime();
        const newUrl = `file:///${result.outputPath.replace(/\\/g, '/')}?t=${timestamp}`;
        setWorkspacePdfUrls(prev => new Map(prev).set(currentWorkspace.id, newUrl));
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      setLogs(prev => prev + `\n\n✗ Error: ${error.message}\n`);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFileIndex, openFiles]);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  return (
    <div className="app-container">
      {/* Update Notification Banner */}
      {updateAvailable && !updateDownloaded && (
        <div className="update-banner">
          <div className="update-info">
            ℹ️ New version {updateInfo?.version} is available!
          </div>
          <div className="update-actions">
            {isDownloading ? (
              <div className="update-progress">
                Downloading... {Math.round(downloadProgress)}%
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleDownloadUpdate}
              >
                Download Update
              </button>
            )}
          </div>
        </div>
      )}

      {/* Update Downloaded Banner */}
      {updateDownloaded && (
        <div className="update-banner update-ready">
          <div className="update-info">
            ✓ Update downloaded and ready to install!
          </div>
          <div className="update-actions">
            <button
              className="btn btn-success"
              onClick={handleInstallUpdate}
            >
              Install and Restart
            </button>
          </div>
        </div>
      )}

      {/* Workspace Tabs */}
      {workspaces.length > 0 && (
        <div className="workspace-tabs">
          {workspaces.map(workspace => (
            <div
              key={workspace.id}
              className={`workspace-tab ${activeWorkspaceId === workspace.id ? 'active' : ''}`}
              onClick={() => setActiveWorkspaceId(workspace.id)}
            >
              <span className="workspace-tab-name">{workspace.name}</span>
              <button
                className="workspace-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseWorkspace(workspace.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="workspace-tab-new"
            onClick={() => setShowWorkspaceForm(true)}
            title="New PDF Workspace"
          >
            +
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="app-content">
        {/* Left Panel */}
        <div className="left-panel">
          {workspaces.length === 0 && !showWorkspaceForm ? (
            // Initial state - no workspaces
            <div className="no-workspace-state">
              <button
                className="btn btn-primary btn-large"
                onClick={() => setShowWorkspaceForm(true)}
              >
                New PDF Workspace
              </button>
              
              {recentWorkspaces.length > 0 && (
                <div className="recent-workspaces-container" style={{ 
                  marginTop: '30px', 
                  width: '600px', 
                  maxWidth: '90%'
                }}>
                  <h3 style={{ 
                    marginBottom: '12px', 
                    color: '#cccccc',
                    fontSize: '14px',
                    fontWeight: 'normal',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Recent Workspaces
                  </h3>
                  <div style={{
                    border: '1px solid #3e3e3e',
                    borderRadius: '4px',
                    backgroundColor: '#252526',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    padding: '8px'
                  }}>
                    {recentWorkspaces.slice(0, 10).map((workspacePath, index) => {
                      const workspaceName = workspacePath.split('\\').pop() || workspacePath;
                      return (
                        <div 
                          key={index}
                          className="recent-workspace-item"
                          onClick={() => openWorkspaceByPath(workspacePath)}
                          style={{
                            padding: '12px 15px',
                            marginBottom: index < recentWorkspaces.length - 1 ? '4px' : '0',
                            backgroundColor: '#2d2d2d',
                            border: '1px solid #3e3e3e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#3e3e3e';
                            e.currentTarget.style.borderColor = '#007acc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#2d2d2d';
                            e.currentTarget.style.borderColor = '#3e3e3e';
                          }}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#ffffff', fontSize: '14px' }}>
                            {workspaceName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#999999', fontFamily: 'monospace' }}>
                            {workspacePath}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : showWorkspaceForm ? (
            // Workspace creation form
            <div className="workspace-form">
              <h2>Create PDF Workspace</h2>

              <div className="form-group">
                <label>Folder Location:</label>
                <div className="folder-input-group">
                  <input
                    type="text"
                    value={workspaceFolder}
                    readOnly
                    placeholder="Select where to create workspace..."
                  />
                  <button onClick={handleBrowseFolder}>Browse...</button>
                </div>
              </div>

              <div className="form-group">
                <label>Workspace Name:</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Enter workspace name..."
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleCreateWorkspace}
                  disabled={!workspaceFolder || !workspaceName.trim()}
                >
                  Create PDF Workspace
                </button>
                {workspaces.length > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowWorkspaceForm(false);
                      setWorkspaceFolder('');
                      setWorkspaceName('');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Render all workspaces (only active one visible)
            workspaces.map(workspace => {
              const isActive = workspace.id === activeWorkspaceId;
              return (
                <div
                  key={workspace.id}
                  style={{
                    display: isActive ? 'contents' : 'none',
                    gridColumn: '1 / -1',
                    height: '100%'
                  }}
                >
                  {/* Toolbar */}
                  <div className="workspace-toolbar" style={{ display: isActive ? 'flex' : 'none' }}>
                    <div className="toolbar-group">
                      <label>XML file:</label>
                      <select
                        value={selectedXmlFile}
                        onChange={(e) => setSelectedXmlFile(e.target.value)}
                      >
                        <option value="">Select XML file...</option>
                        {workspaceFiles.xml.map(file => (
                          <option key={file} value={file}>{file.replace('xml/', '')}</option>
                        ))}
                      </select>
                    </div>

                    <div className="toolbar-group">
                      <label>XSL file:</label>
                      <select
                        value={selectedXslFile}
                        onChange={(e) => setSelectedXslFile(e.target.value)}
                      >
                        <option value="">Select XSL file...</option>
                        {workspaceFiles.xsl.map(file => (
                          <option key={file} value={file}>{file.replace('xsl/', '')}</option>
                        ))}
                      </select>
                    </div>

                    <div className="toolbar-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={autoGenerate}
                          onChange={(e) => setAutoGenerate(e.target.checked)}
                        />
                        Auto-generate
                      </label>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={handleGeneratePDF}
                      disabled={!selectedXmlFile || !selectedXslFile}
                    >
                      Generate PDF
                    </button>
                  </div>

                  {/* Workspace Layout */}
                  <div className="workspace-layout" style={{ display: isActive ? 'flex' : 'none' }}>
                    {/* Vertical Icon Bar */}
                    <div className="icon-bar">
                      <button
                        className={`icon-button ${showFileExplorer && !showSearch ? 'active' : ''}`}
                        onClick={() => {
                          setShowFileExplorer(!showFileExplorer);
                          setShowSearch(false);
                        }}
                        title="File Explorer"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </button>
                      <button
                        className={`icon-button ${showSearch ? 'active' : ''}`}
                        onClick={() => {
                          setShowSearch(!showSearch);
                          setShowFileExplorer(false);
                        }}
                        title="Search"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                      </button>
                    </div>

                    {/* Side Panel (File Explorer or Search) */}
                    {(showFileExplorer || showSearch) && (
                      <div className="side-panel">
                        {showFileExplorer && (
                          <div className="file-explorer">
                            <div className="panel-header">
                              <h4>EXPLORER</h4>
                            </div>
                            <div className="file-tree">
                              <div className="workspace-name">{workspace.name}</div>

                              {/* XML Folder */}
                              <div className="file-tree-item folder">
                                <span className="folder-icon">📁</span> xml
                              </div>
                              {workspaceFiles.xml.map(file => (
                                <div
                                  key={file}
                                  className="file-tree-item file"
                                  style={{ paddingLeft: '28px' }}
                                  onClick={() => handleFileClick(file)}
                                >
                                  <span className="file-icon">📄</span> {file.replace('xml/', '')}
                                </div>
                              ))}

                              {/* XSL Folder */}
                              <div className="file-tree-item folder">
                                <span className="folder-icon">📁</span> xsl
                              </div>
                              {workspaceFiles.xsl.map(file => (
                                <div
                                  key={file}
                                  className="file-tree-item file"
                                  style={{ paddingLeft: '28px' }}
                                  onClick={() => handleFileClick(file)}
                                >
                                  <span className="file-icon">📄</span> {file.replace('xsl/', '')}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {showSearch && (
                          <div className="search-panel">
                            <div className="panel-header">
                              <h4>SEARCH</h4>
                            </div>
                            <div className="search-content">
                              <input 
                                type="text" 
                                placeholder="Search files..." 
                                className="search-input"
                                disabled
                                style={{ opacity: 0.5 }}
                              />
                              <p className="placeholder-text" style={{ marginTop: '20px' }}>
                                🔍 File search functionality coming in a future update.
                                <br /><br />
                                For now, use the file explorer to navigate your workspace files.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Editor Area */}
                    <div className="editor-area">
                      {openFiles.length === 0 ? (
                        <p className="placeholder-text">No files open. Click a file in the explorer to edit.</p>
                      ) : (
                        <>
                          {/* Inner File Tabs */}
                          <div className="inner-file-tabs">
                            {openFiles.map((file, index) => (
                              <div
                                key={file.path}
                                className={`inner-tab ${activeFileIndex === index ? 'active' : ''}`}
                                onClick={() => setActiveFileIndex(index)}
                              >
                                <span className="tab-name">
                                  {file.isDirty && <span className="dirty-indicator">● </span>}
                                  {file.name}
                                </span>
                                <button
                                  className="tab-close"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseFile(index);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Monaco Editor */}
                          {activeFile && (
                            <div className="editor-container-monaco">
                              <Editor
                                key={`${activeFile.path}-${editorReloadKey}`}
                                height="100%"
                                language="xml"
                                theme="vs-dark"
                                value={activeFile.content}
                                onChange={handleEditorChange}
                                onMount={(editor) => {
                                  editorRef.current = editor;
                                }}
                                options={{
                                  minimap: { enabled: true },
                                  fontSize: 14,
                                  wordWrap: 'on',
                                  automaticLayout: true,
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Panel - Render for each workspace */}
        {workspaces.map(workspace => {
          const isActive = workspace.id === activeWorkspaceId;
          return (
            <div
              key={`pdf-panel-${workspace.id}`}
              className="right-panel"
              style={{ display: isActive ? 'flex' : 'none' }}
            >
              <div className="pdf-viewer">
                {workspacePdfUrls.get(workspace.id) ? (
                  <iframe
                    key={`pdf-${workspace.id}`}
                    src={workspacePdfUrls.get(workspace.id)}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title={`PDF Preview - ${workspace.name}`}
                  />
                ) : (
                  <div className="pdf-placeholder">
                    {logs && logs.includes('✗') ? (
                      <>
                        <p>❌ PDF Generation Failed</p>
                        <p>Check the Output/Errors panel for details</p>
                      </>
                    ) : (
                      <>
                        <p>No PDF generated yet</p>
                        <p>Select XML and XSL files, then click Generate PDF</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Bottom Panel */}
        {showLogs && (
          <div className="bottom-panel">
            <div className="logs-header">
              <h3>Output / Errors</h3>
              <div className="logs-actions">
                <button onClick={() => setLogs('')}>Clear</button>
                <button onClick={() => setShowLogs(false)}>Hide</button>
              </div>
            </div>
            <pre className="logs-content">{logs || 'No output yet...'}</pre>
          </div>
        )}

        {/* Logs Toggle Button */}
        {!showLogs && (
          <button className="logs-toggle" onClick={() => setShowLogs(true)}>
            Show Output / Errors
          </button>
        )}
      </div>
    </div>
  )
}

export default App
