import { Workspace } from '../types';

interface WorkspaceTabBarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  showWorkspaceForm: boolean;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onCloseWorkspaceForm: () => void;
}

export const WorkspaceTabBar = ({
  workspaces,
  activeWorkspaceId,
  showWorkspaceForm,
  onSelectWorkspace,
  onCloseWorkspace,
  onNewWorkspace,
  onCloseWorkspaceForm,
}: WorkspaceTabBarProps) => {
  if (workspaces.length === 0 && !showWorkspaceForm) return null;

  // Form tab is active when showWorkspaceForm is true and no workspace is explicitly active
  const isFormTabActive = showWorkspaceForm && activeWorkspaceId === null;

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
      {showWorkspaceForm && (
        <div
          className={`workspace-tab ${isFormTabActive ? 'active' : ''}`}
          onClick={() => onSelectWorkspace(null)}
        >
          <span className="workspace-tab-name">New Workspace</span>
          <button
            className="workspace-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseWorkspaceForm();
            }}
          >
            ×
          </button>
        </div>
      )}
      <button
        className="workspace-tab-new"
        onClick={onNewWorkspace}
        title="New Workspace"
      >
        +
      </button>
    </div>
  );
};
