import { useState, useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { UpdateBanner } from './components/UpdateBanner';
import { WorkspaceTabBar } from './components/WorkspaceTabBar';
import { WorkspaceForm } from './components/WorkspaceForm';
import { NoWorkspaceView } from './components/NoWorkspaceView';
import { Toolbar } from './components/Toolbar';
import { IconBar } from './components/IconBar';
import { FileExplorer } from './components/FileExplorer';
import { SearchPanel } from './components/SearchPanel';
import { EditorPane } from './components/EditorPane';
import { PdfViewer } from './components/PdfViewer';
import { LogPanel } from './components/LogPanel';
import { Workspace, OpenFile } from './types';
import './App.css';

function AppContent() {
  const {
    workspaces,
    setWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    showWorkspaceForm,
    setShowWorkspaceForm,
    showFileExplorer,
    setShowFileExplorer,
    showSearch,
    setShowSearch,
    workspaceFiles,
    setWorkspaceFiles,
    openFiles,
    setOpenFiles,
    activeFileIndex,
    setActiveFileIndex,
    editorReloadKey,
    setEditorReloadKey,
    editorRef,
    selectedXmlFile,
    setSelectedXmlFile,
    selectedXslFile,
    setSelectedXslFile,
    autoGenerate,
    setAutoGenerate,
    workspacePdfUrls,
    setWorkspacePdfUrls,
    logs,
    setLogs,
    showLogs,
    setShowLogs,
    recentWorkspaces,
    setRecentWorkspaces,
    workspacesRef,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
    openFilesRef,
    activeFileIndexRef,
    autoGenerateRef,
    selectedXmlFileRef,
    selectedXslFileRef,
  } = useWorkspace();

  // State for updates
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Keep refs up to date
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces, workspacesRef]);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId, activeWorkspaceIdRef]);
  useEffect(() => { activeWorkspaceRef.current = activeWorkspace; }, [activeWorkspace, activeWorkspaceRef]);
  useEffect(() => { openFilesRef.current = openFiles; }, [openFiles, openFilesRef]);
  useEffect(() => { activeFileIndexRef.current = activeFileIndex; }, [activeFileIndex, activeFileIndexRef]);
  useEffect(() => { autoGenerateRef.current = autoGenerate; }, [autoGenerate, autoGenerateRef]);
  useEffect(() => { selectedXmlFileRef.current = selectedXmlFile; }, [selectedXmlFile, selectedXmlFileRef]);
  useEffect(() => { selectedXslFileRef.current = selectedXslFile; }, [selectedXslFile, selectedXslFileRef]);

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
  }, [setRecentWorkspaces]);

  // Listen for generation logs
  useEffect(() => {
    if (window.electronAPI) {
      const handleLog = (log: string) => {
        setLogs(prev => prev + log);
      };
      
      const cleanup = window.electronAPI.onGenerationLog(handleLog);
      return cleanup;
    }
  }, []);

  // Listen for update events
  useEffect(() => {
    if (window.electronAPI) {
      const cleanups: (() => void)[] = [];

      const cleanup1 = window.electronAPI.onUpdateAvailable?.((info: any) => {
        setUpdateAvailable(true);
        setUpdateInfo(info);
      });
      if (cleanup1) cleanups.push(cleanup1);

      const cleanup2 = window.electronAPI.onUpdateDownloaded?.((_info: any) => {
        setUpdateDownloaded(true);
        setIsDownloading(false);
      });
      if (cleanup2) cleanups.push(cleanup2);

      const cleanup3 = window.electronAPI.onUpdateProgress?.((progress: any) => {
        setDownloadProgress(progress.percent);
      });
      if (cleanup3) cleanups.push(cleanup3);

      const cleanup4 = window.electronAPI.onUpdateError?.((error: string) => {
        console.error('Update error:', error);
        setIsDownloading(false);
      });
      if (cleanup4) cleanups.push(cleanup4);

      return () => cleanups.forEach(cleanup => cleanup());
    }
  }, []);

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

    const cleanup1 = window.electronAPI.onFileChanged(handleFileChanged);

    // Listen for workspace restoration
    const cleanup2 = window.electronAPI.onRestoreWorkspaces(async (workspacePaths: string[]) => {
      for (const workspacePath of workspacePaths) {
        await openWorkspaceByPath(workspacePath);
      }
    });

    return () => {
      cleanup1();
      cleanup2();
    };
  }, []);

  const handleOpenFolderAsWorkspace = async () => {
    try {
      // Ask user to select a folder
      const folderPath = await window.electronAPI.selectFolder();
      
      if (!folderPath) {
        return; // User cancelled
      }

      // Check if workspace is already open
      const isAlreadyOpen = workspaces.some(w => w.path === folderPath);

      if (isAlreadyOpen) {
        alert('This workspace is already open');
        // Switch to existing workspace
        const existingWorkspace = workspaces.find(w => w.path === folderPath);
        if (existingWorkspace) {
          setActiveWorkspaceId(existingWorkspace.id);
        }
        return;
      }

      // Call IPC to validate/setup folder as workspace
      const result = await window.electronAPI.openFolderAsWorkspace(folderPath);

      if (result.success) {
        // Create new workspace object
        const newWorkspace: Workspace = {
          id: Date.now().toString(),
          name: result.workspaceName,
          path: result.workspacePath
        };

        setWorkspaces([...workspaces, newWorkspace]);
        setActiveWorkspaceId(newWorkspace.id);

        // Add to recent workspaces
        await window.electronAPI.addRecentWorkspace(result.workspacePath);
      }
    } catch (error: any) {
      alert(`Failed to open folder as workspace: ${error.message}`);
      console.error('Error opening folder as workspace:', error);
    }
  };

  // Listen for menu events
  useEffect(() => {
    const handleNewWorkspace = () => {
      setShowWorkspaceForm(true);
      setActiveWorkspaceId(null);
    };

    const cleanupNewWorkspace = window.electronAPI.onMenuNewWorkspace?.(handleNewWorkspace);
    const cleanupOpenFolder = window.electronAPI.onMenuOpenFolder?.(handleOpenFolderAsWorkspace);

    return () => {
      cleanupNewWorkspace?.();
      cleanupOpenFolder?.();
    };
  }, [handleOpenFolderAsWorkspace]);

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

  const handleCreateWorkspace = async (folder: string, name: string) => {
    try {
      // Call IPC to create workspace folder structure
      const result = await window.electronAPI.createWorkspace(folder, name);

      if (result.success) {
        // Check if workspace is already open
        const isAlreadyOpen = workspaces.some(w => w.path === result.workspacePath);

        if (isAlreadyOpen) {
          alert('This workspace is already open');
          // Switch to existing workspace
          const existingWorkspace = workspaces.find(w => w.path === result.workspacePath);
          if (existingWorkspace) {
            setActiveWorkspaceId(existingWorkspace.id);
          }
          setShowWorkspaceForm(false);
          return;
        }

        // Create new workspace object
        const newWorkspace: Workspace = {
          id: Date.now().toString(),
          name: name,
          path: result.workspacePath
        };

        setWorkspaces([...workspaces, newWorkspace]);
        setActiveWorkspaceId(newWorkspace.id);

        // Add to recent workspaces
        await window.electronAPI.addRecentWorkspace(result.workspacePath);

        setShowWorkspaceForm(false);
      }
    } catch (error: any) {
      alert(`Failed to create workspace: ${error.message}`);
      console.error('Error creating workspace:', error);
    }
  };

  const handleCloseWorkspace = async (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);

    if (workspace) {
      try {
        await window.electronAPI.stopFileWatcher(workspace.path);
      } catch (error) {
        console.error('Failed to stop file watcher:', error);
      }
    }

    const updatedWorkspaces = workspaces.filter(w => w.id !== workspaceId);
    setWorkspaces(updatedWorkspaces);

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
      loadWorkspaceSettings(activeWorkspace.path);
    } else {
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

    // Normalize path separators - convert forward slashes to backslashes
    const normalizedFilePath = filePath.replace(/\//g, '\\');
    const fullPath = `${activeWorkspace.path}\\${normalizedFilePath}`;
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    // Check if file is already open - use case-insensitive comparison with normalized separators
    const existingIndex = openFiles.findIndex(f => {
      const normalizedOpenPath = f.path.toLowerCase().replace(/\//g, '\\');
      const normalizedFullPath = fullPath.toLowerCase().replace(/\//g, '\\');
      return normalizedOpenPath === normalizedFullPath;
    });
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
      return;
    }

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

    if (file.isDirty) {
      const confirmClose = confirm(`${file.name} has unsaved changes. Close anyway?`);
      if (!confirmClose) return;
    }

    const newOpenFiles = openFiles.filter((_, i) => i !== index);
    setOpenFiles(newOpenFiles);

    if (activeFileIndex === index) {
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

  const handleFileRenamed = (oldPath: string, newPath: string) => {
    if (!activeWorkspace) return;

    // Normalize path separators - convert forward slashes to backslashes
    const normalizedOldPath = oldPath.replace(/\//g, '\\');
    const normalizedNewPath = newPath.replace(/\//g, '\\');
    
    const oldFullPath = `${activeWorkspace.path}\\${normalizedOldPath}`;
    const newFullPath = `${activeWorkspace.path}\\${normalizedNewPath}`;
    const newFileName = newPath.split(/[/\\]/).pop() || newPath;

    // Update open files - use case-insensitive comparison and normalize separators
    const updatedFiles = openFiles.map(file => {
      const normalizedFilePath = file.path.toLowerCase().replace(/\//g, '\\');
      const normalizedOldFullPath = oldFullPath.toLowerCase().replace(/\//g, '\\');
      
      if (normalizedFilePath === normalizedOldFullPath) {
        return {
          ...file,
          path: newFullPath,
          name: newFileName
        };
      }
      return file;
    });
    
    setOpenFiles(updatedFiles);

    // Update toolbar selections
    if (selectedXmlFile === oldPath) {
      setSelectedXmlFile(newPath);
    }
    if (selectedXslFile === oldPath) {
      setSelectedXslFile(newPath);
    }
  };

  const handleFileDeleted = (filePath: string) => {
    if (!activeWorkspace) return;

    // Normalize path separators
    const normalizedFilePath = filePath.replace(/\//g, '\\');
    const fullPath = `${activeWorkspace.path}\\${normalizedFilePath}`;

    // Find the index of the deleted file
    const deletedFileIndex = openFiles.findIndex(file => {
      const normalizedOpenFilePath = file.path.toLowerCase().replace(/\//g, '\\');
      const normalizedFullPath = fullPath.toLowerCase().replace(/\//g, '\\');
      return normalizedOpenFilePath === normalizedFullPath;
    });

    // Remove deleted file from open files
    if (deletedFileIndex !== -1) {
      const updatedFiles = openFiles.filter((_, index) => index !== deletedFileIndex);
      setOpenFiles(updatedFiles);

      // Update active file index
      if (deletedFileIndex === activeFileIndex) {
        // Deleted file was active, switch to another tab or -1 if no tabs left
        if (updatedFiles.length > 0) {
          setActiveFileIndex(Math.min(deletedFileIndex, updatedFiles.length - 1));
        } else {
          setActiveFileIndex(-1);
        }
      } else if (activeFileIndex > deletedFileIndex) {
        setActiveFileIndex(activeFileIndex - 1);
      }
    }

    // Clear toolbar selections if deleted file was selected
    if (selectedXmlFile === filePath) {
      setSelectedXmlFile('');
    }
    if (selectedXslFile === filePath) {
      setSelectedXslFile('');
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
      setLogs('');

      const xmlPath = `${currentWorkspace.path}\\${currentXmlFile}`;
      const xslPath = `${currentWorkspace.path}\\${currentXslFile}`;
      const xslFolder = `${currentWorkspace.path}\\xsl`;

      const result = await window.electronAPI.generatePdf(xmlPath, xslPath, xslFolder);

      if (result.success) {
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFileIndex, openFiles]);

  const handleToggleFileExplorer = () => {
    setShowFileExplorer(!showFileExplorer);
    setShowSearch(false);
  };

  const handleToggleSearch = () => {
    setShowSearch(!showSearch);
    setShowFileExplorer(false);
  };

  return (
    <div className="app-container">
      <UpdateBanner
        updateAvailable={updateAvailable}
        updateInfo={updateInfo}
        updateDownloaded={updateDownloaded}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />

      <WorkspaceTabBar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        showWorkspaceForm={showWorkspaceForm}
        onSelectWorkspace={(id) => {
          setActiveWorkspaceId(id);
          if (id === null) {
            setShowWorkspaceForm(true);
          }
        }}
        onCloseWorkspace={handleCloseWorkspace}
        onNewWorkspace={() => {
          setShowWorkspaceForm(true);
          setActiveWorkspaceId(null);
        }}
        onCloseWorkspaceForm={() => {
          setShowWorkspaceForm(false);
          // Switch to last workspace if available and no workspace is currently active
          if (workspaces.length > 0 && activeWorkspaceId === null) {
            setActiveWorkspaceId(workspaces[workspaces.length - 1].id);
          }
        }}
      />

      <div className="app-content">
        {workspaces.length === 0 && !showWorkspaceForm ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <NoWorkspaceView
              recentWorkspaces={recentWorkspaces}
              onNewWorkspace={() => {
                setShowWorkspaceForm(true);
                setActiveWorkspaceId(null);
              }}
              onOpenWorkspace={openWorkspaceByPath}
              onOpenFolder={handleOpenFolderAsWorkspace}
            />
          </div>
        ) : showWorkspaceForm && activeWorkspaceId === null ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <WorkspaceForm
              onCreateWorkspace={handleCreateWorkspace}
              onCancel={() => setShowWorkspaceForm(false)}
              showCancel={workspaces.length > 0}
            />
          </div>
        ) : (
          <>
            <div className="left-panel">
              {workspaces.map(workspace => {
                const isActive = workspace.id === activeWorkspaceId;
                return (
                  <div
                    key={workspace.id}
                    style={{
                      display: isActive ? 'flex' : 'none',
                      flexDirection: 'column',
                      height: '100%',
                      overflow: 'hidden'
                    }}
                  >
                    <Toolbar
                      workspaceFiles={workspaceFiles}
                      selectedXmlFile={selectedXmlFile}
                      selectedXslFile={selectedXslFile}
                      autoGenerate={autoGenerate}
                      onSelectXmlFile={setSelectedXmlFile}
                      onSelectXslFile={setSelectedXslFile}
                      onToggleAutoGenerate={setAutoGenerate}
                      onGeneratePDF={handleGeneratePDF}
                    />

                    <div className="workspace-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                      <IconBar
                        showFileExplorer={showFileExplorer}
                        showSearch={showSearch}
                        onToggleFileExplorer={handleToggleFileExplorer}
                        onToggleSearch={handleToggleSearch}
                      />

                      {(showFileExplorer || showSearch) && (
                        <div className="side-panel">
                          {showFileExplorer && (
                            <FileExplorer
                              workspace={workspace}
                              workspaceFiles={workspaceFiles}
                              onFileClick={handleFileClick}
                              onFilesChanged={() => loadWorkspaceFiles(workspace.path)}
                              onFileRenamed={handleFileRenamed}
                              onFileDeleted={handleFileDeleted}
                            />
                          )}
                          {showSearch && <SearchPanel />}
                        </div>
                      )}

                      <EditorPane
                        openFiles={openFiles}
                        activeFileIndex={activeFileIndex}
                        editorReloadKey={editorReloadKey}
                        onEditorChange={handleEditorChange}
                        onEditorMount={(editor) => { editorRef.current = editor; }}
                        onCloseFile={handleCloseFile}
                        onSelectFile={setActiveFileIndex}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {workspaces.map(workspace => (
              workspace.id === activeWorkspaceId && (
                <PdfViewer
                  key={`pdf-panel-${workspace.id}`}
                  pdfUrl={workspacePdfUrls.get(workspace.id)}
                  workspaceName={workspace.name}
                  logs={logs}
                />
              )
            ))}
          </>
        )}

        <LogPanel
          logs={logs}
          showLogs={showLogs}
          onClearLogs={() => setLogs('')}
          onHideLogs={() => setShowLogs(false)}
          onShowLogs={() => setShowLogs(true)}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
    </WorkspaceProvider>
  );
}

export default App;
