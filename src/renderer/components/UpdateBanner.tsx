interface UpdateBannerProps {
  updateAvailable: boolean;
  updateInfo: any;
  updateDownloaded: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
}

export const UpdateBanner = ({
  updateAvailable,
  updateInfo,
  updateDownloaded,
  isDownloading,
  downloadProgress,
  onDownloadUpdate,
  onInstallUpdate,
}: UpdateBannerProps) => {
  if (!updateAvailable && !updateDownloaded) return null;

  return (
    <>
      {/* Update Notification Banner */}
      {updateAvailable && !updateDownloaded && (
        <div className="update-banner">
          <div className="update-info">
            ℹ️ New version {updateInfo?.version} is available!
          </div>
          <div className="update-actions">
            {isDownloading ? (
              <div className="update-progress">
                Downloading... {Math.round(downloadProgress)}%
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={onDownloadUpdate}
              >
                Download Update
              </button>
            )}
          </div>
        </div>
      )}

      {/* Update Downloaded Banner */}
      {updateDownloaded && (
        <div className="update-banner update-ready">
          <div className="update-info">
            ✓ Update downloaded and ready to install!
          </div>
          <div className="update-actions">
            <button
              className="btn btn-success"
              onClick={onInstallUpdate}
            >
              Install and Restart
            </button>
          </div>
        </div>
      )}
    </>
  );
};
