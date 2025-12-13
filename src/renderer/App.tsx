import { useState, useEffect } from 'react'
import './App.css'

function App() {
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
      
      {/* Main Content */}
      <div className="app-content">
        {/* Left Panel - Placeholder for new workspace UI */}
        <div className="left-panel">
          <div className="workspace-placeholder">
            <p>UI cleared - ready for workspace implementation</p>
          </div>
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
