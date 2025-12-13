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
  const editorRef = useRef<any>(null)
  
  // State for PDF preview
  const [pdfUrl, setPdfUrl] = useState<string>('')
  
  // State for logs
  const [logs, setLogs] = useState<string>('')
  const [showLogs, setShowLogs] = useState<boolean>(false)
  
  // State for updates
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false)
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  
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

  const handleCloseWorkspace = (workspaceId: string) => {
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

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  // Load workspace files when active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      loadWorkspaceFiles(activeWorkspace.path);
      // Reset toolbar selections when switching workspace
      setSelectedXmlFile('');
      setSelectedXslFile('');
      // Clear open files when switching workspace
      setOpenFiles([]);
      setActiveFileIndex(-1);
    } else {
      // Clear files when no workspace is active
      setWorkspaceFiles({ xml: [], xsl: [] });
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
          ) : activeWorkspace ? (
            // Active workspace view
            <>
              {/* Toolbar */}
              <div className="workspace-toolbar">
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
                  onClick={() => console.log('Generate PDF:', selectedXmlFile, selectedXslFile)}
                  disabled={!selectedXmlFile || !selectedXslFile}
                >
                  Generate PDF
                </button>
              </div>

              {/* Workspace Layout */}
              <div className="workspace-layout">
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
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
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
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
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
                        <div className="workspace-name">{activeWorkspace.name}</div>
                        
                        {/* XML Folder */}
                        <div className="file-tree-item folder">
                          <span className="folder-icon">📁</span> xml
                        </div>
                        {workspaceFiles.xml.map(file => (
                          <div 
                            key={file} 
                            className="file-tree-item file" 
                            style={{paddingLeft: '28px'}}
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
                            style={{paddingLeft: '28px'}}
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
                      <p className="placeholder-text">Search functionality coming soon...</p>
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
            </>
          ) : null}
        </div>
      
      {/* Right Panel */}
      <div className="right-panel">
        <div className="pdf-viewer">
          {pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="PDF Preview"
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
