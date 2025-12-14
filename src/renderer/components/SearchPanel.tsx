export const SearchPanel = () => {
  return (
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
  );
};
