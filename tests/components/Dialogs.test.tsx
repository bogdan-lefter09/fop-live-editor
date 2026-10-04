import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { IconBar } from '../../src/renderer/components/IconBar';
import { WorkspaceForm } from '../../src/renderer/components/WorkspaceForm';
import { SearchPanel } from '../../src/renderer/components/SearchPanel';
import SettingsDialog from '../../src/renderer/components/SettingsDialog';
import FopSettingsDialog from '../../src/renderer/components/FopSettingsDialog';
import { mockElectronAPI } from '../helpers/electronApi';

describe('IconBar', () => {
  it('highlights explorer/search and fires handlers', async () => {
    const h = { onToggleFileExplorer: vi.fn(), onToggleSearch: vi.fn(), onOpenSettings: vi.fn() };
    const { rerender } = render(<IconBar showFileExplorer showSearch={false} {...h} />);
    expect(screen.getByTitle('File Explorer')).toHaveClass('active');
    expect(screen.getByTitle('Search')).not.toHaveClass('active');
    await userEvent.click(screen.getByTitle('Search'));
    await userEvent.click(screen.getByTitle('File Explorer'));
    await userEvent.click(screen.getByTitle('Settings'));
    expect(h.onToggleSearch).toHaveBeenCalled();
    expect(h.onToggleFileExplorer).toHaveBeenCalled();
    expect(h.onOpenSettings).toHaveBeenCalled();
    rerender(<IconBar showFileExplorer showSearch {...h} />);
    expect(screen.getByTitle('File Explorer')).not.toHaveClass('active');
    expect(screen.getByTitle('Search')).toHaveClass('active');
  });
});

describe('WorkspaceForm', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps Create disabled until folder and name are set, then submits and resets', async () => {
    const api = mockElectronAPI({ selectFolder: async () => 'C:\\parent' });
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceForm onCreateWorkspace={onCreate} onCancel={vi.fn()} showCancel={false} />);
    const create = screen.getByRole('button', { name: 'Create Workspace' });
    expect(create).toBeDisabled();

    await userEvent.click(screen.getByText('Browse...'));
    expect(api.selectFolder).toHaveBeenCalled();
    expect(await screen.findByDisplayValue('C:\\parent')).toBeInTheDocument();
    expect(create).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('Enter workspace name...'), 'My WS');
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith('C:\\parent', 'My WS');
    await waitFor(() => expect(screen.getByPlaceholderText('Enter workspace name...')).toHaveValue(''));
  });

  it('ignores a cancelled folder dialog and whitespace-only names', async () => {
    mockElectronAPI({ selectFolder: async () => null });
    render(<WorkspaceForm onCreateWorkspace={vi.fn()} onCancel={vi.fn()} showCancel={false} />);
    await userEvent.click(screen.getByText('Browse...'));
    await userEvent.type(screen.getByPlaceholderText('Enter workspace name...'), '   ');
    expect(screen.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  });

  it('shows Cancel only when requested', async () => {
    mockElectronAPI();
    const onCancel = vi.fn();
    const { rerender } = render(<WorkspaceForm onCreateWorkspace={vi.fn()} onCancel={onCancel} showCancel={false} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<WorkspaceForm onCreateWorkspace={vi.fn()} onCancel={onCancel} showCancel />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SearchPanel', () => {
  const workspace = { id: '1', name: 'ws', path: 'C:\\ws' } as any;

  // Stateful host so the controlled props behave like in App.tsx
  const Host = ({ ws = workspace, onFileClick = vi.fn() }: any) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    return (
      <SearchPanel {...{ workspace: ws, onFileClick, searchQuery, setSearchQuery, caseSensitive, setCaseSensitive, useRegex, setUseRegex, isSearching, setIsSearching, results, setResults, error, setError, expandedFiles, setExpandedFiles }} />
    );
  };

  it('disables inputs without a workspace', () => {
    mockElectronAPI();
    render(<Host ws={null} />);
    expect(screen.getByPlaceholderText('Search...')).toBeDisabled();
    expect(screen.getByText('Open a workspace to search files.')).toBeInTheDocument();
  });

  it('debounces, searches with the options and renders results; clicking a match opens it', async () => {
    const searchWorkspace = vi.fn().mockResolvedValue({
      success: true,
      results: [{ file: 'xml/a.xml', matches: [{ line: 3, column: 5, text: 'an invoice here', matchText: 'invoice' }] }],
    });
    mockElectronAPI({ searchWorkspace });
    const onFileClick = vi.fn();
    render(<Host onFileClick={onFileClick} />);

    await userEvent.type(screen.getByPlaceholderText('Search...'), 'invoice');
    expect(searchWorkspace).not.toHaveBeenCalled();
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(searchWorkspace).toHaveBeenCalledWith('C:\\ws', 'invoice', { caseSensitive: false, useRegex: false });

    expect(await screen.findByText('1 result in 1 file')).toBeInTheDocument();
    expect(screen.getByText('xml/a.xml')).toBeInTheDocument();
    await userEvent.click(screen.getByText('3:'));
    expect(onFileClick).toHaveBeenCalledWith('xml/a.xml', 3, 5, 7);
  });

  it('re-searches when options change', async () => {
    const searchWorkspace = vi.fn().mockResolvedValue({ success: true, results: [] });
    mockElectronAPI({ searchWorkspace });
    render(<Host />);
    await userEvent.type(screen.getByPlaceholderText('Search...'), 'x');
    await waitFor(() => expect(searchWorkspace).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await userEvent.click(screen.getByLabelText('Use Regex (.*)'));
    await waitFor(() => expect(searchWorkspace).toHaveBeenLastCalledWith('C:\\ws', 'x', { caseSensitive: false, useRegex: true }), { timeout: 2000 });
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('shows errors from the search call', async () => {
    mockElectronAPI({ searchWorkspace: vi.fn().mockRejectedValue(new Error('disk exploded')) });
    render(<Host />);
    await userEvent.type(screen.getByPlaceholderText('Search...'), 'x');
    expect(await screen.findByText('disk exploded', undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it('collapses and expands a file group', async () => {
    mockElectronAPI({
      searchWorkspace: vi.fn().mockResolvedValue({ success: true, results: [{ file: 'xsl/s.xsl', matches: [{ line: 1, column: 1, text: 'abc', matchText: 'a' }] }] }),
    });
    render(<Host />);
    await userEvent.type(screen.getByPlaceholderText('Search...'), 'a');
    await userEvent.click(await screen.findByText('xsl/s.xsl', undefined, { timeout: 2000 }));
    expect(screen.queryByText('1:')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('xsl/s.xsl'));
    expect(screen.getByText('1:')).toBeInTheDocument();
  });
});

describe('SettingsDialog', () => {
  const api = (over = {}) =>
    mockElectronAPI({
      getFopSettings: async () => ({ useBundled: true, customFopPath: null }),
      getJreSettings: async () => ({ useBundled: true, customJrePath: null }),
      getSkipDeleteConfirm: async () => false,
      saveFopSettings: async () => ({ success: true }),
      saveJreSettings: async () => ({ success: true }),
      setSkipDeleteConfirm: async () => undefined,
      restartApp: async () => ({ success: true }),
      validateFopDirectory: async () => ({ valid: true }),
      validateJreDirectory: async () => ({ valid: true }),
      ...over,
    });

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders nothing when closed', () => {
    api();
    const { container } = render(<SettingsDialog isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads current settings when opened', async () => {
    api({ getSkipDeleteConfirm: async () => true, getFopSettings: async () => ({ useBundled: false, customFopPath: 'C:\\fop' }) });
    render(<SettingsDialog isOpen onClose={vi.fn()} />);
    expect(await screen.findByDisplayValue('C:\\fop')).toBeInTheDocument();
    expect(screen.getByLabelText(/Don't ask for confirmation/)).toBeChecked();
  });

  it('saving only a preference does not prompt for restart', async () => {
    const m = api();
    const onClose = vi.fn();
    render(<SettingsDialog isOpen onClose={onClose} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByLabelText(/Don't ask for confirmation/));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.setSkipDeleteConfirm).toHaveBeenCalledWith(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('requires a directory when switching to a custom JRE', async () => {
    const m = api();
    const onClose = vi.fn();
    render(<SettingsDialog isOpen onClose={onClose} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByLabelText('Use custom JRE installation'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Please select a JRE directory first')).toBeInTheDocument();
    expect(m.saveJreSettings).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows validation errors from Browse and blocks saving an invalid FOP directory', async () => {
    const m = api({
      selectFopDirectory: async () => ({ path: 'C:\\bad', validation: { valid: false, error: 'Missing lib directory' } }),
      validateFopDirectory: async () => ({ valid: false, error: 'Missing lib directory' }),
    });
    render(<SettingsDialog isOpen onClose={vi.fn()} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByLabelText('Use custom FOP installation'));
    await userEvent.click(screen.getAllByText('Browse...')[0]);
    expect(await screen.findByText('Missing lib directory')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.validateFopDirectory).toHaveBeenCalledWith('C:\\bad'));
    expect(m.saveFopSettings).not.toHaveBeenCalled();
  });

  it('saves a changed custom FOP and restarts when the user agrees', async () => {
    const m = api({
      selectFopDirectory: async () => ({ path: 'C:\\fop', validation: { valid: true } }),
    });
    (window.confirm as any).mockReturnValue(true);
    const onClose = vi.fn();
    render(<SettingsDialog isOpen onClose={onClose} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByLabelText('Use custom FOP installation'));
    await userEvent.click(screen.getAllByText('Browse...')[0]);
    await screen.findByDisplayValue('C:\\fop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.saveFopSettings).toHaveBeenCalledWith({ useBundled: false, customFopPath: 'C:\\fop' });
    expect(m.restartApp).toHaveBeenCalled();
  });

  it('tells the user to restart manually when they decline', async () => {
    api({ selectJreDirectory: async () => ({ path: 'C:\\jre', validation: { valid: true } }) });
    const onClose = vi.fn();
    render(<SettingsDialog isOpen onClose={onClose} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByLabelText('Use custom JRE installation'));
    await userEvent.click(screen.getAllByText('Browse...')[0]);
    await screen.findByDisplayValue('C:\\jre');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('restart the application manually'));
  });

  it('Cancel closes without saving', async () => {
    const m = api();
    const onClose = vi.fn();
    render(<SettingsDialog isOpen onClose={onClose} />);
    await screen.findByText('Settings');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(m.saveFopSettings).not.toHaveBeenCalled();
  });
});

describe('FopSettingsDialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('refuses to switch to custom without a selected directory', async () => {
    mockElectronAPI({ getFopSettings: async () => ({ useBundled: true, customFopPath: null }) });
    render(<FopSettingsDialog isOpen onClose={vi.fn()} />);
    await userEvent.click(await screen.findByLabelText('Use custom FOP installation'));
    expect(screen.getByText('Please select a FOP directory first')).toBeInTheDocument();
    expect(screen.getByLabelText('Use bundled FOP')).toBeChecked();
  });

  it('saves bundled selection and closes', async () => {
    const m = mockElectronAPI({
      getFopSettings: async () => ({ useBundled: true, customFopPath: null }),
      saveFopSettings: async () => ({ success: true }),
    });
    const onClose = vi.fn();
    render(<FopSettingsDialog isOpen onClose={onClose} />);
    await screen.findByLabelText('Use bundled FOP');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.saveFopSettings).toHaveBeenCalledWith({ useBundled: true, customFopPath: undefined });
  });

  it('shows the error when saving fails', async () => {
    mockElectronAPI({
      getFopSettings: async () => ({ useBundled: true, customFopPath: null }),
      saveFopSettings: async () => ({ success: false, error: 'nope' }),
    });
    const onClose = vi.fn();
    render(<FopSettingsDialog isOpen onClose={onClose} />);
    await screen.findByLabelText('Use bundled FOP');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('nope')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
