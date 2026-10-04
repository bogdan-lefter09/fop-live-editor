import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from '../../src/renderer/components/Toolbar';
import { WorkspaceTabBar } from '../../src/renderer/components/WorkspaceTabBar';
import { NoWorkspaceView } from '../../src/renderer/components/NoWorkspaceView';
import { UpdateBanner } from '../../src/renderer/components/UpdateBanner';
import { LogPanel } from '../../src/renderer/components/LogPanel';
import { PdfViewer } from '../../src/renderer/components/PdfViewer';

describe('Toolbar', () => {
  const files = {
    xml: [{ name: 'b.xml', path: 'b.xml', type: 'file' as const }, { name: 'sub', path: 'sub', type: 'folder' as const, children: [{ name: 'a.xml', path: 'a.xml', type: 'file' as const }] }],
    xsl: [{ name: 's.xsl', path: 's.xsl', type: 'file' as const }],
  };
  const setup = (over = {}) => {
    const handlers = { onSelectXmlFile: vi.fn(), onSelectXslFile: vi.fn(), onToggleAutoGenerate: vi.fn(), onGeneratePDF: vi.fn() };
    render(<Toolbar workspaceFiles={files} selectedXmlFile="" selectedXslFile="" autoGenerate={false} {...handlers} {...over} />);
    return handlers;
  };

  it('lists files flattened with nested paths, sorted', () => {
    setup();
    const xmlOptions = screen.getAllByRole('combobox')[0].querySelectorAll('option');
    expect([...xmlOptions].map(o => o.value)).toEqual(['', 'xml/b.xml', 'xml/sub/a.xml']);
  });

  it('disables Generate until both files are selected', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
  });

  it('enables Generate and calls the handler', async () => {
    const h = setup({ selectedXmlFile: 'xml/b.xml', selectedXslFile: 'xsl/s.xsl' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    expect(h.onGeneratePDF).toHaveBeenCalled();
  });

  it('reports selection and auto-generate changes', async () => {
    const h = setup();
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'xml/sub/a.xml');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'xsl/s.xsl');
    await userEvent.click(screen.getByLabelText('Auto-generate'));
    expect(h.onSelectXmlFile).toHaveBeenCalledWith('xml/sub/a.xml');
    expect(h.onSelectXslFile).toHaveBeenCalledWith('xsl/s.xsl');
    expect(h.onToggleAutoGenerate).toHaveBeenCalledWith(true);
  });
});

describe('WorkspaceTabBar', () => {
  const workspaces = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }] as any;
  const setup = (over = {}) => {
    const h = { onSelectWorkspace: vi.fn(), onCloseWorkspace: vi.fn(), onNewWorkspace: vi.fn(), onCloseWorkspaceForm: vi.fn() };
    const view = render(<WorkspaceTabBar workspaces={workspaces} activeWorkspaceId="1" showWorkspaceForm={false} {...h} {...over} />);
    return { h, view };
  };

  it('renders nothing with no workspaces and no form', () => {
    const { view } = setup({ workspaces: [] });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('marks the active tab and selects another on click', async () => {
    const { h } = setup();
    expect(screen.getByText('Alpha').parentElement).toHaveClass('active');
    await userEvent.click(screen.getByText('Beta'));
    expect(h.onSelectWorkspace).toHaveBeenCalledWith('2');
  });

  it('closing a tab does not also select it', async () => {
    const { h } = setup();
    await userEvent.click(screen.getAllByText('×')[1]);
    expect(h.onCloseWorkspace).toHaveBeenCalledWith('2');
    expect(h.onSelectWorkspace).not.toHaveBeenCalled();
  });

  it('shows the New Workspace form tab', async () => {
    const { h } = setup({ showWorkspaceForm: true, activeWorkspaceId: null });
    expect(screen.getByText('New Workspace').parentElement).toHaveClass('active');
    await userEvent.click(screen.getAllByText('×')[2]);
    expect(h.onCloseWorkspaceForm).toHaveBeenCalled();
    await userEvent.click(screen.getByTitle('New Workspace'));
    expect(h.onNewWorkspace).toHaveBeenCalled();
  });
});

describe('NoWorkspaceView', () => {
  it('offers New Workspace and Open Folder', async () => {
    const onNewWorkspace = vi.fn(); const onOpenFolder = vi.fn();
    render(<NoWorkspaceView recentWorkspaces={[]} onNewWorkspace={onNewWorkspace} onOpenWorkspace={vi.fn()} onOpenFolder={onOpenFolder} />);
    await userEvent.click(screen.getByRole('button', { name: 'New Workspace' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(onNewWorkspace).toHaveBeenCalled();
    expect(onOpenFolder).toHaveBeenCalled();
    expect(screen.queryByText('Recent Workspaces')).not.toBeInTheDocument();
  });

  it('lists at most 10 recent workspaces and opens one on click', async () => {
    const recents = Array.from({ length: 12 }, (_, i) => `C:\\ws\\project${i}`);
    const onOpenWorkspace = vi.fn();
    render(<NoWorkspaceView recentWorkspaces={recents} onNewWorkspace={vi.fn()} onOpenWorkspace={onOpenWorkspace} onOpenFolder={vi.fn()} />);
    expect(document.querySelectorAll('.recent-workspace-item')).toHaveLength(10);
    await userEvent.click(screen.getByText('project3'));
    expect(onOpenWorkspace).toHaveBeenCalledWith('C:\\ws\\project3');
  });
});

describe('UpdateBanner', () => {
  const base = { updateAvailable: false, updateInfo: { version: '2.0.0' }, updateDownloaded: false, isDownloading: false, downloadProgress: 0, onDownloadUpdate: vi.fn(), onInstallUpdate: vi.fn() };

  it('renders nothing without updates', () => {
    const { container } = render(<UpdateBanner {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to download an available update', async () => {
    const onDownloadUpdate = vi.fn();
    render(<UpdateBanner {...base} updateAvailable onDownloadUpdate={onDownloadUpdate} />);
    expect(screen.getByText(/New version 2.0.0 is available/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download Update' }));
    expect(onDownloadUpdate).toHaveBeenCalled();
  });

  it('shows rounded download progress instead of the button', () => {
    render(<UpdateBanner {...base} updateAvailable isDownloading downloadProgress={42.6} />);
    expect(screen.getByText('Downloading... 43%')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers install once downloaded', async () => {
    const onInstallUpdate = vi.fn();
    render(<UpdateBanner {...base} updateAvailable updateDownloaded onInstallUpdate={onInstallUpdate} />);
    expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Install and Restart' }));
    expect(onInstallUpdate).toHaveBeenCalled();
  });
});

describe('LogPanel', () => {
  it('shows logs with Clear / Hide actions', async () => {
    const onClearLogs = vi.fn(); const onHideLogs = vi.fn();
    render(<LogPanel logs="line 1" showLogs onClearLogs={onClearLogs} onHideLogs={onHideLogs} onShowLogs={vi.fn()} />);
    expect(screen.getByText('line 1')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear'));
    await userEvent.click(screen.getByText('Hide'));
    expect(onClearLogs).toHaveBeenCalled();
    expect(onHideLogs).toHaveBeenCalled();
  });

  it('shows a placeholder for empty logs', () => {
    render(<LogPanel logs="" showLogs onClearLogs={vi.fn()} onHideLogs={vi.fn()} onShowLogs={vi.fn()} />);
    expect(screen.getByText('No output yet...')).toBeInTheDocument();
  });

  it('shows a toggle button when hidden', async () => {
    const onShowLogs = vi.fn();
    render(<LogPanel logs="x" showLogs={false} onClearLogs={vi.fn()} onHideLogs={vi.fn()} onShowLogs={onShowLogs} />);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Show Output / Errors'));
    expect(onShowLogs).toHaveBeenCalled();
  });
});

describe('PdfViewer', () => {
  it('renders the PDF in an iframe', () => {
    render(<PdfViewer pdfUrl="file:///x.pdf?t=1" workspaceName="WS" logs="" />);
    expect(screen.getByTitle('PDF Preview - WS')).toHaveAttribute('src', 'file:///x.pdf?t=1');
  });

  it('shows the empty state', () => {
    render(<PdfViewer pdfUrl={undefined} workspaceName="WS" logs="" />);
    expect(screen.getByText('No PDF generated yet')).toBeInTheDocument();
  });

  it('shows the failure state when logs contain ✗', () => {
    render(<PdfViewer pdfUrl={undefined} workspaceName="WS" logs="✗ boom" />);
    expect(screen.getByText(/PDF Generation Failed/)).toBeInTheDocument();
  });
});
