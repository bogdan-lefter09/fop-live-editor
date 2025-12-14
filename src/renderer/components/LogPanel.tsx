interface LogPanelProps {
  logs: string;
  showLogs: boolean;
  onClearLogs: () => void;
  onHideLogs: () => void;
  onShowLogs: () => void;
}

export const LogPanel = ({ logs, showLogs, onClearLogs, onHideLogs, onShowLogs }: LogPanelProps) => {
  return (
    <>
      {/* Bottom Panel */}
      {showLogs && (
        <div className="bottom-panel">
          <div className="logs-header">
            <h3>Output / Errors</h3>
            <div className="logs-actions">
              <button onClick={onClearLogs}>Clear</button>
              <button onClick={onHideLogs}>Hide</button>
            </div>
          </div>
          <pre className="logs-content">{logs || 'No output yet...'}</pre>
        </div>
      )}

      {/* Logs Toggle Button */}
      {!showLogs && (
        <button className="logs-toggle" onClick={onShowLogs}>
          Show Output / Errors
        </button>
      )}
    </>
  );
};
