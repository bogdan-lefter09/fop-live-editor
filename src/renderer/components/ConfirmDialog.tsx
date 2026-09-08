import { useEffect, useState } from 'react';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (skipNextTime?: boolean) => void;
  onCancel: () => void;
  isDestructive?: boolean;
  showSkipOption?: boolean;
}

export const ConfirmDialog = ({
  show,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
  showSkipOption = false
}: ConfirmDialogProps) => {
  const [skipNextTime, setSkipNextTime] = useState(false);

  useEffect(() => {
    if (show) {
      setSkipNextTime(false);
    }
  }, [show]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm(skipNextTime);
      }
    };

    if (show) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [show, onConfirm, onCancel, skipNextTime]);

  if (!show) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h2>{title}</h2>
        </div>
        <div className="confirm-dialog-body">
          <p>{message}</p>
          {showSkipOption && (
            <label className="confirm-dialog-skip-option">
              <input
                type="checkbox"
                checked={skipNextTime}
                onChange={(e) => setSkipNextTime(e.target.checked)}
              />
              <span>Don't ask me again</span>
            </label>
          )}
        </div>
        <div className="confirm-dialog-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`} 
            onClick={() => onConfirm(skipNextTime)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
