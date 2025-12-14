import { Workspace } from '../types';

interface WorkspaceTabBarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
}

export const WorkspaceTabBar = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCloseWorkspace,
  onNewWorkspace,
}: WorkspaceTabBarProps) => {
  if (workspaces.length === 0) return null;

  return (
    <div className="workspace-tabs">
      {workspaces.map(workspace => (
        <div
          key={workspace.id}
          className={`workspace-tab ${activeWorkspaceId === workspace.id ? 'active' : ''}`}
          onClick={() => onSelectWorkspace(workspace.id)}
        >
          <span className="workspace-tab-name">{workspace.name}</span>
          <button
            className="workspace-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseWorkspace(workspace.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="workspace-tab-new"
        onClick={onNewWorkspace}
        title="New PDF Workspace"
      >
        +
      </button>
    </div>
  );
};
