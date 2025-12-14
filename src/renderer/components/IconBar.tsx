interface IconBarProps {
  showFileExplorer: boolean;
  showSearch: boolean;
  onToggleFileExplorer: () => void;
  onToggleSearch: () => void;
}

export const IconBar = ({ showFileExplorer, showSearch, onToggleFileExplorer, onToggleSearch }: IconBarProps) => {
  return (
    <div className="icon-bar">
      <button
        className={`icon-button ${showFileExplorer && !showSearch ? 'active' : ''}`}
        onClick={onToggleFileExplorer}
        title="File Explorer"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <button
        className={`icon-button ${showSearch ? 'active' : ''}`}
        onClick={onToggleSearch}
        title="Search"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </div>
  );
};
