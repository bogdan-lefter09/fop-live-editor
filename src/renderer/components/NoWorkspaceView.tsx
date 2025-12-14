interface NoWorkspaceViewProps {
  recentWorkspaces: string[];
  onNewWorkspace: () => void;
  onOpenWorkspace: (workspacePath: string) => void;
}

export const NoWorkspaceView = ({ recentWorkspaces, onNewWorkspace, onOpenWorkspace }: NoWorkspaceViewProps) => {
  return (
    <div className="no-workspace-state">
      <button
        className="btn btn-primary btn-large"
        onClick={onNewWorkspace}
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
                  onClick={() => onOpenWorkspace(workspacePath)}
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
  );
};
