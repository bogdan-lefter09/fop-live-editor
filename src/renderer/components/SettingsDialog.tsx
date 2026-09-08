import React, { useState, useEffect } from 'react';
import './SettingsDialog.css';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PathSettings {
  useBundled: boolean;
  customPath: string | null;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [fopSettings, setFopSettings] = useState<PathSettings>({ useBundled: true, customPath: null });
  const [fopSelectedPath, setFopSelectedPath] = useState('');
  const [fopError, setFopError] = useState('');

  const [jreSettings, setJreSettings] = useState<PathSettings>({ useBundled: true, customPath: null });
  const [jreSelectedPath, setJreSelectedPath] = useState('');
  const [jreError, setJreError] = useState('');

  const [skipDeleteConfirm, setSkipDeleteConfirmState] = useState(false);

  const [initialFop, setInitialFop] = useState<PathSettings>({ useBundled: true, customPath: null });
  const [initialJre, setInitialJre] = useState<PathSettings>({ useBundled: true, customPath: null });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const [fop, jre, skipConfirm] = await Promise.all([
        window.electronAPI.getFopSettings(),
        window.electronAPI.getJreSettings(),
        window.electronAPI.getSkipDeleteConfirm(),
      ]);

      const fopState = { useBundled: fop.useBundled, customPath: fop.customFopPath };
      const jreState = { useBundled: jre.useBundled, customPath: jre.customJrePath };

      setFopSettings(fopState);
      setFopSelectedPath(fop.customFopPath || '');
      setFopError('');
      setInitialFop(fopState);

      setJreSettings(jreState);
      setJreSelectedPath(jre.customJrePath || '');
      setJreError('');
      setInitialJre(jreState);

      setSkipDeleteConfirmState(skipConfirm);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleBrowseFop = async () => {
    try {
      setFopError('');
      const result = await window.electronAPI.selectFopDirectory();
      if (result) {
        setFopSelectedPath(result.path);
        setFopError(result.validation.valid ? '' : (result.validation.error || 'Invalid FOP directory'));
      }
    } catch (error) {
      console.error('Failed to select FOP directory:', error);
      setFopError('Failed to select directory');
    }
  };

  const handleBrowseJre = async () => {
    try {
      setJreError('');
      const result = await window.electronAPI.selectJreDirectory();
      if (result) {
        setJreSelectedPath(result.path);
        setJreError(result.validation.valid ? '' : (result.validation.error || 'Invalid JRE directory'));
      }
    } catch (error) {
      console.error('Failed to select JRE directory:', error);
      setJreError('Failed to select directory');
    }
  };

  const handleSaveAll = async () => {
    setIsLoading(true);
    try {
      // Validate custom paths if selected
      if (!fopSettings.useBundled && fopSelectedPath) {
        const validation = await window.electronAPI.validateFopDirectory(fopSelectedPath);
        if (!validation.valid) {
          setFopError(validation.error || 'Invalid FOP directory');
          setIsLoading(false);
          return;
        }
      }
      if (!jreSettings.useBundled && jreSelectedPath) {
        const validation = await window.electronAPI.validateJreDirectory(jreSelectedPath);
        if (!validation.valid) {
          setJreError(validation.error || 'Invalid JRE directory');
          setIsLoading(false);
          return;
        }
      }
      if (!fopSettings.useBundled && !fopSelectedPath) {
        setFopError('Please select a FOP directory first');
        setIsLoading(false);
        return;
      }
      if (!jreSettings.useBundled && !jreSelectedPath) {
        setJreError('Please select a JRE directory first');
        setIsLoading(false);
        return;
      }

      const finalFop = { useBundled: fopSettings.useBundled, customFopPath: fopSelectedPath || undefined };
      const finalJre = { useBundled: jreSettings.useBundled, customJrePath: jreSelectedPath || undefined };

      await Promise.all([
        window.electronAPI.saveFopSettings(finalFop),
        window.electronAPI.saveJreSettings(finalJre),
        window.electronAPI.setSkipDeleteConfirm(skipDeleteConfirm),
      ]);

      const fopChanged = initialFop.useBundled !== fopSettings.useBundled || initialFop.customPath !== fopSelectedPath;
      const jreChanged = initialJre.useBundled !== jreSettings.useBundled || initialJre.customPath !== jreSelectedPath;

      if (fopChanged || jreChanged) {
        const shouldRestart = window.confirm(
          'FOP/JRE settings have been saved. The application needs to restart to apply the change. Restart now?'
        );
        if (shouldRestart) {
          const restartResult = await window.electronAPI.restartApp();
          if (!restartResult.success) {
            alert(`Warning: Settings saved but failed to restart application: ${restartResult.error}`);
          }
        } else {
          alert('Settings saved. Please restart the application manually to apply the change.');
        }
      }

      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="settings-dialog">
        <div className="dialog-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose} disabled={isLoading}>×</button>
        </div>

        <div className="dialog-body">
          <section className="settings-section">
            <h3>FOP Version</h3>
            <label className="settings-radio-option">
              <input
                type="radio"
                name="fopOption"
                checked={fopSettings.useBundled}
                onChange={() => setFopSettings(prev => ({ ...prev, useBundled: true }))}
                disabled={isLoading}
              />
              Use bundled FOP
            </label>
            <label className="settings-radio-option">
              <input
                type="radio"
                name="fopOption"
                checked={!fopSettings.useBundled}
                onChange={() => setFopSettings(prev => ({ ...prev, useBundled: false }))}
                disabled={isLoading}
              />
              Use custom FOP installation
            </label>
            {!fopSettings.useBundled && (
              <div className="settings-path-row">
                <input type="text" value={fopSelectedPath} readOnly placeholder="No directory selected" className="path-input" />
                <button onClick={handleBrowseFop} disabled={isLoading} className="browse-button">Browse...</button>
              </div>
            )}
            {fopError && <div className="validation-error">{fopError}</div>}
          </section>

          <section className="settings-section">
            <h3>JRE (Java Runtime)</h3>
            <label className="settings-radio-option">
              <input
                type="radio"
                name="jreOption"
                checked={jreSettings.useBundled}
                onChange={() => setJreSettings(prev => ({ ...prev, useBundled: true }))}
                disabled={isLoading}
              />
              Use bundled JRE
            </label>
            <label className="settings-radio-option">
              <input
                type="radio"
                name="jreOption"
                checked={!jreSettings.useBundled}
                onChange={() => setJreSettings(prev => ({ ...prev, useBundled: false }))}
                disabled={isLoading}
              />
              Use custom JRE installation
            </label>
            {!jreSettings.useBundled && (
              <div className="settings-path-row">
                <input type="text" value={jreSelectedPath} readOnly placeholder="No directory selected" className="path-input" />
                <button onClick={handleBrowseJre} disabled={isLoading} className="browse-button">Browse...</button>
              </div>
            )}
            {jreError && <div className="validation-error">{jreError}</div>}
          </section>

          <section className="settings-section">
            <h3>Preferences</h3>
            <label className="settings-checkbox-option">
              <input
                type="checkbox"
                checked={skipDeleteConfirm}
                onChange={(e) => setSkipDeleteConfirmState(e.target.checked)}
                disabled={isLoading}
              />
              Don't ask for confirmation before deleting files/folders
            </label>
          </section>
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} disabled={isLoading} className="cancel-button">Cancel</button>
          <button onClick={handleSaveAll} disabled={isLoading} className="ok-button">
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
