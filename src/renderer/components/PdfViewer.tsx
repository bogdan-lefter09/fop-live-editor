interface PdfViewerProps {
  pdfUrl: string | undefined;
  workspaceName: string;
  logs: string;
}

export const PdfViewer = ({ pdfUrl, workspaceName, logs }: PdfViewerProps) => {
  return (
    <div className="right-panel">
      <div className="pdf-viewer">
        {pdfUrl ? (
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={`PDF Preview - ${workspaceName}`}
          />
        ) : (
          <div className="pdf-placeholder">
            {logs && logs.includes('✗') ? (
              <>
                <p>❌ PDF Generation Failed</p>
                <p>Check the Output/Errors panel for details</p>
              </>
            ) : (
              <>
                <p>No PDF generated yet</p>
                <p>Select XML and XSL files, then click Generate PDF</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
