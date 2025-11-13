import { useState, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { xml } from '@codemirror/lang-xml'
import './App.css'

function App() {
  // State for file selection
  const [xmlFolder, setXmlFolder] = useState<string>('')
  const [xslFolder, setXslFolder] = useState<string>('')
  const [xmlFiles, setXmlFiles] = useState<string[]>([])
  const [xslFiles, setXslFiles] = useState<string[]>([])
  const [selectedXml, setSelectedXml] = useState<string>('')
  const [selectedXsl, setSelectedXsl] = useState<string>('')
  
  // State for editor
  const [editorContent, setEditorContent] = useState<string>('')
  const [currentFile, setCurrentFile] = useState<string>('')
  const [editingXml, setEditingXml] = useState<boolean>(true)
  
  // State for PDF preview
  const [pdfUrl, setPdfUrl] = useState<string>('')
  
  // State for logs
  const [logs, setLogs] = useState<string>('')
  const [autoGenerate, setAutoGenerate] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  
  // Load files when XML folder changes
  useEffect(() => {
    if (xmlFolder) {
      loadXmlFiles();
    } else {
      setXmlFiles([]);
      setSelectedXml('');
    }
  }, [xmlFolder]);
  
  // Load files when XSL folder changes
  useEffect(() => {
    if (xslFolder) {
      loadXslFiles();
    } else {
      setXslFiles([]);
      setSelectedXsl('');
    }
  }, [xslFolder]);
  
  // Load file content when selection changes
  useEffect(() => {
    if (editingXml && selectedXml && xmlFolder) {
      loadFileContent(xmlFolder, selectedXml);
    }
  }, [editingXml, selectedXml, xmlFolder]);
  
  useEffect(() => {
    if (!editingXml && selectedXsl && xslFolder) {
      loadFileContent(xslFolder, selectedXsl);
    }
  }, [editingXml, selectedXsl, xslFolder]);
  
  // Keyboard shortcut for Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentFile) {
          handleSave();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFile, editorContent]);
  
  // Listen for generation logs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onGenerationLog((log: string) => {
        setLogs(prev => prev + log);
      });
    }
  }, []);
  
  // Helper functions
  const loadXmlFiles = async () => {
    try {
      const files = await window.electronAPI.getFiles(xmlFolder, '.xml');
      setXmlFiles(files);
      addLog(`Found ${files.length} XML file(s) in ${xmlFolder}`);
    } catch (error) {
      addLog(`Error loading XML files: ${error}`);
    }
  };
  
  const loadXslFiles = async () => {
    try {
      const files = await window.electronAPI.getFiles(xslFolder, '.xsl');
      setXslFiles(files);
      addLog(`Found ${files.length} XSL file(s) in ${xslFolder}`);
    } catch (error) {
      addLog(`Error loading XSL files: ${error}`);
    }
  };
  
  const loadFileContent = async (folder: string, filename: string) => {
    try {
      const filePath = `${folder}\\${filename}`;
      const content = await window.electronAPI.readFile(filePath);
      setEditorContent(content);
      setCurrentFile(filePath);
      addLog(`Loaded ${filename}`);
    } catch (error) {
      addLog(`Error loading file: ${error}`);
    }
  };
  
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => `[${timestamp}] ${message}\n${prev}`);
  };
  
  // Handlers
  const handleSelectXmlFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        // If same folder, force refresh by calling loadXmlFiles directly
        if (folder === xmlFolder) {
          addLog(`Refreshing XML folder: ${folder}`);
          loadXmlFiles();
        } else {
          setXmlFolder(folder);
          addLog(`Selected XML folder: ${folder}`);
        }
      }
    } catch (error) {
      addLog(`Error selecting folder: ${error}`);
    }
  };
  
  const handleSelectXslFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        // If same folder, force refresh by calling loadXslFiles directly
        if (folder === xslFolder) {
          addLog(`Refreshing XSL folder: ${folder}`);
          loadXslFiles();
        } else {
          setXslFolder(folder);
          addLog(`Selected XSL folder: ${folder}`);
        }
      }
    } catch (error) {
      addLog(`Error selecting folder: ${error}`);
    }
  };
  
  const handleSave = async () => {
    if (!currentFile || !editorContent) {
      addLog('No file to save');
      return;
    }
    
    try {
      await window.electronAPI.saveFile(currentFile, editorContent);
      const fileName = currentFile.split('\\').pop();
      addLog(`✓ Saved ${fileName}`);
      
      // Auto-generate PDF if enabled
      if (autoGenerate && selectedXml && selectedXsl) {
        handleGenerate();
      }
    } catch (error) {
      addLog(`✗ Error saving file: ${error}`);
    }
  };
  
  const handleGenerate = async () => {
    if (!selectedXml || !selectedXsl || !xmlFolder || !xslFolder) {
      addLog('✗ Please select both XML and XSL files\n');
      return;
    }

    setIsGenerating(true);
    setLogs(''); // Clear previous logs

    try {
      const xmlPath = `${xmlFolder}\\${selectedXml}`;
      const xslPath = `${xslFolder}\\${selectedXsl}`;

      const result = await window.electronAPI.generatePdf(xmlPath, xslPath, xslFolder);

      if (result.success) {
        // Create blob URL for PDF preview
        const uint8Array = new Uint8Array(result.pdfBuffer);
        const blob = new Blob([uint8Array], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Revoke old URL if exists
        if (pdfUrl) {
          URL.revokeObjectURL(pdfUrl);
        }
        
        setPdfUrl(url);
      }
    } catch (error: any) {
      addLog(`\n✗ Error: ${error.message}\n`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-container">
      {/* Left Panel */}
      <div className="left-panel">
        {/* Folder Selection */}
        <div className="folder-selection">
          <div className="folder-group">
            <label>XML Folder:</label>
            <div className="folder-input-group">
              <input type="text" value={xmlFolder} readOnly placeholder="No folder selected" />
              <button onClick={handleSelectXmlFolder}>Browse...</button>
            </div>
          </div>
          
          <div className="folder-group">
            <label>XSL Folder:</label>
            <div className="folder-input-group">
              <input type="text" value={xslFolder} readOnly placeholder="No folder selected" />
              <button onClick={handleSelectXslFolder}>Browse...</button>
            </div>
          </div>
        </div>
        
        {/* File Selection */}
        <div className="file-selection">
          <div className="file-group">
            <label>XML File:</label>
            <select 
              value={selectedXml} 
              onChange={(e) => {
                setSelectedXml(e.target.value);
                setEditingXml(true);
              }}
              disabled={xmlFiles.length === 0}
            >
              <option value="">Select XML file...</option>
              {xmlFiles.map(file => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
          </div>
          
          <div className="file-group">
            <label>XSL File:</label>
            <select 
              value={selectedXsl} 
              onChange={(e) => {
                setSelectedXsl(e.target.value);
                setEditingXml(false);
              }}
              disabled={xslFiles.length === 0}
            >
              <option value="">Select XSL file...</option>
              {xslFiles.map(file => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Editor Tabs */}
        <div className="editor-tabs">
          <button 
            className={editingXml ? 'tab active' : 'tab'}
            onClick={() => setEditingXml(true)}
            disabled={!selectedXml}
          >
            {selectedXml || 'XML'}
          </button>
          <button 
            className={!editingXml ? 'tab active' : 'tab'}
            onClick={() => setEditingXml(false)}
            disabled={!selectedXsl}
          >
            {selectedXsl || 'XSL'}
          </button>
        </div>
        
        {/* Editor */}
        <div className="editor-container">
          <CodeMirror
            value={editorContent}
            height="100%"
            theme="light"
            extensions={[xml()]}
            onChange={(value) => setEditorContent(value)}
            placeholder={currentFile ? `Editing ${currentFile}` : 'Select a file to edit...'}
          />
        </div>
        
        {/* Controls */}
        <div className="controls">
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={!currentFile}
          >
            Save
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleGenerate}
            disabled={!selectedXml || !selectedXsl || isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate PDF'}
          </button>
          <label className="auto-generate">
            <input 
              type="checkbox" 
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
            />
            Auto-generate on save
          </label>
        </div>
      </div>
      
      {/* Right Panel */}
      <div className="right-panel">
        <div className="pdf-toolbar">
          <h3>PDF Preview</h3>
        </div>
        <div className="pdf-viewer">
          {pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="PDF Preview"
            />
          ) : (
            <div className="pdf-placeholder">
              <p>No PDF generated yet</p>
              <p>Select XML and XSL files, then click Generate PDF</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom Panel */}
      <div className="bottom-panel">
        <div className="logs-header">
          <h3>Output / Errors</h3>
          <button onClick={() => setLogs('')}>Clear</button>
        </div>
        <pre className="logs-content">{logs || 'No output yet...'}</pre>
      </div>
    </div>
  )
}

export default App
