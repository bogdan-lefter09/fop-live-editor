import { useState } from 'react';

interface WorkspaceFormProps {
  onCreateWorkspace: (folder: string, name: string) => Promise<void>;
  onCancel: () => void;
  showCancel: boolean;
}

export const WorkspaceForm = ({ onCreateWorkspace, onCancel, showCancel }: WorkspaceFormProps) => {
  const [workspaceFolder, setWorkspaceFolder] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');

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

  const handleSubmit = async () => {
    if (!workspaceFolder || !workspaceName.trim()) {
      alert('Please select a folder and enter a workspace name');
      return;
    }

    await onCreateWorkspace(workspaceFolder, workspaceName);
    
    // Reset form
    setWorkspaceFolder('');
    setWorkspaceName('');
  };

  return (
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
          onClick={handleSubmit}
          disabled={!workspaceFolder || !workspaceName.trim()}
        >
          Create PDF Workspace
        </button>
        {showCancel && (
          <button
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
