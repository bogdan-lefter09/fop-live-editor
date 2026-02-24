import React, { useState, useEffect } from 'react';
import './FopSettingsDialog.css';

interface FopSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FopSettings {
  useBundled: boolean;
  customFopPath: string | null;
}

const FopSettingsDialog: React.FC<FopSettingsDialogProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<FopSettings>({
    useBundled: true,
    customFopPath: null
  });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const fopSettings = await window.electronAPI.getFopSettings();
      setSettings(fopSettings);
      setSelectedPath(fopSettings.customFopPath || '');
      setValidationError('');
    } catch (error) {
      console.error('Failed to load FOP settings:', error);
    }
  };

  const handleBrowse = async () => {
    try {
      setValidationError('');
      const result = await window.electronAPI.selectFopDirectory();
      
      if (result) {
        setSelectedPath(result.path);
        
        if (!result.validation.valid) {
          setValidationError(result.validation.error || 'Invalid FOP directory');
        } else {
          setValidationError('');
          // Don't automatically switch to custom mode, let user decide
        }
      }
    } catch (error) {
      console.error('Failed to select FOP directory:', error);
      setValidationError('Failed to select directory');
    }
  };

  const handleUseBundled = () => {
    setSettings(prev => ({ ...prev, useBundled: true }));
    setValidationError('');
  };

  const handleUseCustom = () => {
    if (!selectedPath) {
      setValidationError('Please select a FOP directory first');
      return;
    }
    
    setSettings(prev => ({ 
      ...prev, 
      useBundled: false,
      customFopPath: selectedPath
    }));
    setValidationError('');
  };

  const validateAndSave = async () => {
    setIsLoading(true);
    try {
      // If using custom FOP, validate the directory first
      if (!settings.useBundled && selectedPath) {
        const validation = await window.electronAPI.validateFopDirectory(selectedPath);
        if (!validation.valid) {
          setValidationError(validation.error || 'Invalid FOP directory');
          setIsLoading(false);
          return;
        }
      }

      // Save settings
      const saveResult = await window.electronAPI.saveFopSettings({
        useBundled: settings.useBundled,
        customFopPath: settings.customFopPath || undefined
      });
      if (!saveResult.success) {
        setValidationError(saveResult.error || 'Failed to save settings');
        setIsLoading(false);
        return;
      }

      // Ask user if they want to restart the application
      const shouldRestart = window.confirm(
        'FOP settings have been saved. The application needs to restart to apply the new FOP version. Restart now?'
      );

      if (shouldRestart) {
        const restartResult = await window.electronAPI.restartApp();
        if (!restartResult.success) {
          alert(`Warning: Settings saved but failed to restart application: ${restartResult.error}`);
        }
      } else {
        alert('Settings saved. Please restart the application manually to apply the new FOP version.');
      }

      onClose();
    } catch (error) {
      console.error('Failed to save FOP settings:', error);
      setValidationError('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-content fop-settings-dialog">
        <div className="dialog-header">
          <h2>Choose FOP Version</h2>
          <button className="close-button" onClick={onClose} disabled={isLoading}>×</button>
        </div>
        
        <div className="dialog-body">
          <div className="fop-option">
            <label>
              <input
                type="radio"
                name="fopOption"
                checked={settings.useBundled}
                onChange={handleUseBundled}
                disabled={isLoading}
              />
              Use bundled FOP
            </label>
            <p className="option-description">
              Use the FOP installation that comes with this application
            </p>
          </div>

          <div className="fop-option">
            <label>
              <input
                type="radio"
                name="fopOption"
                checked={!settings.useBundled}
                onChange={handleUseCustom}
                disabled={isLoading}
              />
              Use custom FOP installation
            </label>
            <p className="option-description">
              Select your own FOP installation directory
            </p>
            
            <div className="custom-path-section">
              <div className="path-input-group">
                <input
                  type="text"
                  value={selectedPath}
                  readOnly
                  placeholder="No directory selected"
                  className="path-input"
                />
                <button 
                  onClick={handleBrowse}
                  disabled={isLoading}
                  className="browse-button"
                >
                  Browse...
                </button>
              </div>
              
              {validationError && (
                <div className="validation-error">
                  {validationError}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="dialog-footer">
          <button 
            onClick={onClose} 
            disabled={isLoading}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={validateAndSave}
            disabled={isLoading || (!settings.useBundled && !selectedPath)}
            className="ok-button"
          >
            {isLoading ? 'Saving...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FopSettingsDialog;