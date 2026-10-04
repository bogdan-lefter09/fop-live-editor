import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileExplorer } from '../../src/renderer/components/FileExplorer';
import { ToastProvider } from '../../src/renderer/context/ToastContext';
import { mockElectronAPI } from '../helpers/electronApi';

const workspace = { id: '1', name: 'My WS', path: 'C:\\ws' } as any;
const files = {
  xml: [
    { name: 'sub', path: 'sub', type: 'folder', children: [{ name: 'inner.xml', path: 'inner.xml', type: 'file' }] },
    { name: 'a.xml', path: 'a.xml', type: 'file' },
    { name: 'b.xml', path: 'b.xml', type: 'file' },
  ],
  xsl: [{ name: 's.xsl', path: 's.xsl', type: 'file' }],
} as any;

function setup(apiOver: Record<string, any> = {}, skipConfirm = false) {
  const api = mockElectronAPI({ getSkipDeleteConfirm: async () => skipConfirm, ...apiOver });
  const props = {
    workspace,
    workspaceFiles: files,
    onFileClick: vi.fn(),
    onFilesChanged: vi.fn(),
    onFileRenamed: vi.fn(),
    onFileDeleted: vi.fn(),
  };
  render(<ToastProvider><FileExplorer {...props} /></ToastProvider>);
  return { api, props };
}

const rightClick = (el: HTMLElement) => fireEvent.contextMenu(el);
const item = (name: string) => screen.getByText(name, { selector: '.file-tree-item', exact: false });
const menu = (name: string) => screen.getByText(name, { selector: '.context-menu-item' });

describe('FileExplorer', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the workspace name and expanded xml/xsl trees (folders first)', () => {
    setup();
    expect(screen.getByText('My WS')).toBeInTheDocument();
    const names = [...document.querySelectorAll('.file-tree-item')].map(e => e.textContent?.trim());
    expect(names.some(n => n?.endsWith('xml') && !n.includes('.'))).toBe(true);
    expect(screen.getByText(/a\.xml/)).toBeInTheDocument();
    expect(screen.getByText(/s\.xsl/)).toBeInTheDocument();
  });

  it('collapses and expands a root folder on click', async () => {
    setup();
    await userEvent.click(screen.getByText('xsl', { selector: '.file-tree-item' }));
    expect(screen.queryByText(/s\.xsl/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('xsl', { selector: '.file-tree-item' }));
    expect(screen.getByText(/s\.xsl/)).toBeInTheDocument();
  });

  it('opens a file on click with its full workspace-relative path', async () => {
    const { props } = setup();
    await userEvent.click(item('sub'));
    await userEvent.click(item('a.xml'));
    expect(props.onFileClick).toHaveBeenCalledWith('xml/a.xml');
    await userEvent.click(item('inner.xml'));
    expect(props.onFileClick).toHaveBeenLastCalledWith('xml/sub/inner.xml');
  });

  it('Ctrl-click multi-selects without opening and Shift-click selects a range', async () => {
    const { props } = setup();
    await userEvent.click(item('sub'));
    await userEvent.click(item('inner.xml'));
    props.onFileClick.mockClear();
    fireEvent.click(item('b.xml'), { shiftKey: true });
    expect(document.querySelectorAll('.file-tree-item.selected:not(.folder)')).toHaveLength(3);
    expect(props.onFileClick).not.toHaveBeenCalled();

    await userEvent.click(item('a.xml'));
    fireEvent.click(item('b.xml'), { ctrlKey: true });
    expect(document.querySelectorAll('.file-tree-item.selected:not(.folder)')).toHaveLength(2);
  });

  describe('create file', () => {
    it('suggests an extension from the root folder, creates and opens the file', async () => {
      const { api, props } = setup({ createFile: async () => ({ success: true, filePath: 'xsl/newfile.xsl' }) });
      rightClick(screen.getByText('xsl', { selector: '.file-tree-item' }));
      await userEvent.click(menu('New File'));
      const input = document.querySelector('.file-name-input') as HTMLInputElement;
      expect(input).toHaveValue('newfile.xsl');
      await userEvent.type(input, '{Enter}');
      await waitFor(() => expect(api.createFile).toHaveBeenCalledWith('C:\\ws', 'xsl', 'newfile.xsl'));
      expect(props.onFilesChanged).toHaveBeenCalled();
      expect(props.onFileClick).toHaveBeenCalledWith('xsl/newfile.xsl');
      expect(document.querySelector('.file-name-input')).toBeNull();
    });

    it('shows the server error inline and keeps the input open', async () => {
      setup({ createFile: vi.fn().mockRejectedValue(new Error('A file with this name already exists')) });
      rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
      await userEvent.click(menu('New File'));
      await userEvent.type(document.querySelector('.file-name-input')!, '{Enter}');
      expect(await screen.findByText('A file with this name already exists', { selector: '.file-create-error' })).toBeInTheDocument();
      expect(document.querySelector('.file-name-input')).not.toBeNull();
    });

    it('rejects an empty name locally and Escape cancels', async () => {
      const { api } = setup();
      rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
      await userEvent.click(menu('New File'));
      const input = document.querySelector('.file-name-input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, '{Enter}');
      expect(await screen.findByText('Filename cannot be empty')).toBeInTheDocument();
      expect(api.createFile).not.toHaveBeenCalled();
      await userEvent.type(input, '{Escape}');
      expect(document.querySelector('.file-name-input')).toBeNull();
    });
  });

  it('creates a folder in a root folder', async () => {
    const { api, props } = setup({ createFolder: async () => ({ success: true, folderPath: 'xml/newfolder' }) });
    rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
    await userEvent.click(menu('New Folder'));
    const input = document.querySelector('.file-name-input') as HTMLInputElement;
    expect(input).toHaveValue('newfolder');
    await userEvent.type(input, '{Enter}');
    await waitFor(() => expect(api.createFolder).toHaveBeenCalledWith('C:\\ws', 'xml', 'newfolder'));
    expect(props.onFilesChanged).toHaveBeenCalled();
  });

  describe('rename', () => {
    it('renames a file and notifies the parent', async () => {
      const { api, props } = setup({ renameFile: async () => ({ success: true, oldPath: 'xml/a.xml', newPath: 'xml/z.xml' }) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Rename'));
      const input = document.querySelector('.file-name-input') as HTMLInputElement;
      expect(input).toHaveValue('a.xml');
      await userEvent.clear(input);
      await userEvent.type(input, 'z.xml{Enter}');
      await waitFor(() => expect(api.renameFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml', 'z.xml'));
      expect(props.onFileRenamed).toHaveBeenCalledWith('xml/a.xml', 'xml/z.xml');
      expect(props.onFilesChanged).toHaveBeenCalled();
      expect(await screen.findByText('Renamed to "z.xml"')).toBeInTheDocument();
    });

    it('shows an error toast when renaming fails', async () => {
      setup({ renameFile: vi.fn().mockRejectedValue(new Error('A file with this name already exists')) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Rename'));
      await userEvent.type(document.querySelector('.file-name-input')!, '{Enter}');
      expect(await screen.findByRole('status')).toHaveTextContent('A file with this name already exists');
    });

    it('renames a subfolder but offers no rename/delete for root folders', async () => {
      const { api } = setup({ renameFolder: async () => ({ success: true, oldPath: 'xml/sub', newPath: 'xml/renamed' }) });
      rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
      expect(screen.queryByText('Rename', { selector: '.context-menu-item' })).toBeNull();
      expect(screen.queryByText('Delete Folder')).toBeNull();
      fireEvent.click(document.body);

      rightClick(item('sub'));
      await userEvent.click(menu('Rename'));
      const input = document.querySelector('.file-name-input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, 'renamed{Enter}');
      await waitFor(() => expect(api.renameFolder).toHaveBeenCalledWith('C:\\ws', 'xml/sub', 'renamed'));
    });
  });

  describe('delete', () => {
    it('asks for confirmation, then deletes and notifies', async () => {
      const { api, props } = setup({ deleteFile: async () => ({ success: true, deletedPath: 'xml/a.xml' }) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Delete'));
      expect(screen.getByRole('heading', { name: 'Delete File' })).toBeInTheDocument();
      expect(screen.getByText("Are you sure you want to delete 'a.xml'?")).toBeInTheDocument();
      expect(api.deleteFile).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(api.deleteFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml'));
      expect(props.onFileDeleted).toHaveBeenCalledWith('xml/a.xml');
      expect(props.onFilesChanged).toHaveBeenCalled();
    });

    it('does nothing when cancelled', async () => {
      const { api } = setup();
      rightClick(item('a.xml'));
      await userEvent.click(menu('Delete'));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(api.deleteFile).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Delete File' })).toBeNull();
    });

    it('deletes via the Delete key on the selected file', async () => {
      setup();
      await userEvent.click(item('b.xml'));
      await userEvent.keyboard('{Delete}');
      expect(screen.getByText("Are you sure you want to delete 'b.xml'?")).toBeInTheDocument();
    });

    it('deletes a folder with a folder-specific confirmation', async () => {
      const { api } = setup({ deleteFolder: async () => ({ success: true }) });
      rightClick(item('sub'));
      await userEvent.click(menu('Delete Folder'));
      expect(screen.getByRole('heading', { name: 'Delete Folder' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(api.deleteFolder).toHaveBeenCalledWith('C:\\ws', 'xml/sub'));
    });

    it('skips the dialog when the "don\'t ask again" preference is on', async () => {
      const { api } = setup({ deleteFile: async () => ({ success: true }) }, true);
      await waitFor(() => expect(api.getSkipDeleteConfirm).toHaveBeenCalled());
      await new Promise(r => setTimeout(r, 20));
      rightClick(item('a.xml'));
      await userEvent.click(menu('Delete'));
      await waitFor(() => expect(api.deleteFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml'));
      expect(screen.queryByRole('heading', { name: 'Delete File' })).toBeNull();
    });

    it('persists "don\'t ask again" from the dialog', async () => {
      const { api } = setup({ deleteFile: async () => ({ success: true }) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Delete'));
      await userEvent.click(screen.getByLabelText("Don't ask me again"));
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(api.setSkipDeleteConfirm).toHaveBeenCalledWith(true));
    });

    it('bulk-deletes a multi-selection after one confirmation', async () => {
      const { api } = setup({ deleteFile: async () => ({ success: true }) });
      await userEvent.click(item('a.xml'));
      fireEvent.click(item('b.xml'), { ctrlKey: true });
      rightClick(item('b.xml'));
      await userEvent.click(menu('Delete 2 Files'));
      expect(screen.getByText('Are you sure you want to delete 2 selected files?')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(api.deleteFile).toHaveBeenCalledTimes(2));
    });

    it('shows an error toast when deletion fails', async () => {
      setup({ deleteFile: vi.fn().mockRejectedValue(new Error('locked')) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Delete'));
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(await screen.findByRole('status')).toHaveTextContent('locked');
    });
  });

  describe('copy / paste', () => {
    it('copies a file and pastes it into a folder from the context menu', async () => {
      const { api, props } = setup({ copyFile: async () => ({ success: true, newPath: 'xsl/a.xml' }) });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Copy'));
      expect(await screen.findByText('Copied "a.xml"')).toBeInTheDocument();
      rightClick(screen.getByText('xsl', { selector: '.file-tree-item' }));
      await userEvent.click(menu('Paste'));
      await waitFor(() => expect(api.copyFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml', 'xsl'));
      expect(props.onFilesChanged).toHaveBeenCalled();
      expect(await screen.findByText('Pasted file')).toBeInTheDocument();
    });

    it('supports Ctrl+C / Ctrl+V into the selected file\'s folder', async () => {
      const { api } = setup({ copyFile: async () => ({ success: true }) });
      await userEvent.click(item('a.xml'));
      await userEvent.keyboard('{Control>}c{/Control}');
      await userEvent.keyboard('{Control>}v{/Control}');
      await waitFor(() => expect(api.copyFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml', 'xml'));
    });

    it('offers Paste only after something was copied', () => {
      setup();
      rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
      expect(screen.queryByText('Paste', { selector: '.context-menu-item' })).toBeNull();
    });
  });

  it('F5 and the Refresh menu entry trigger a refresh', async () => {
    const { props } = setup();
    await userEvent.keyboard('{F5}');
    expect(props.onFilesChanged).toHaveBeenCalledTimes(1);
    rightClick(screen.getByText('xml', { selector: '.file-tree-item' }));
    await userEvent.click(menu('Refresh'));
    expect(props.onFilesChanged).toHaveBeenCalledTimes(2);
  });

  describe('undo', () => {
    it('Ctrl+Z reverts the last rename', async () => {
      const { api } = setup({
        renameFile: vi.fn()
          .mockResolvedValueOnce({ success: true, oldPath: 'xml/a.xml', newPath: 'xml/z.xml' })
          .mockResolvedValue({ success: true, oldPath: 'xml/z.xml', newPath: 'xml/a.xml' }),
      });
      rightClick(item('a.xml'));
      await userEvent.click(menu('Rename'));
      const input = document.querySelector('.file-name-input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, 'z.xml{Enter}');
      await waitFor(() => expect(api.renameFile).toHaveBeenCalledTimes(1));
      await screen.findByText('Renamed to "z.xml"');
      await userEvent.keyboard('{Control>}z{/Control}');
      await waitFor(() => expect(api.renameFile).toHaveBeenCalledTimes(2));
      expect(api.renameFile).toHaveBeenLastCalledWith('C:\\ws', 'xml/z.xml', 'a.xml');
    });
  });

  describe('drag and drop', () => {
    const dataTransfer = () => {
      const store: Record<string, string> = {};
      return {
        store,
        types: [] as string[],
        setData(k: string, v: string) { store[k] = v; this.types = Object.keys(store); },
        getData: (k: string) => store[k] ?? '',
        effectAllowed: '',
        dropEffect: '',
      };
    };

    it('moves a dragged file into another folder', async () => {
      const { api, props } = setup({ moveFile: async () => ({ success: true, oldPath: 'xml/a.xml', newPath: 'xml/sub/a.xml' }) });
      const dt = dataTransfer();
      fireEvent.dragStart(item('a.xml'), { dataTransfer: dt });
      expect(JSON.parse(dt.store['application/x-fop-files'])).toEqual(['xml/a.xml']);
      fireEvent.drop(item('sub'), { dataTransfer: dt });
      await waitFor(() => expect(api.moveFile).toHaveBeenCalledWith('C:\\ws', 'xml/a.xml', 'xml/sub'));
      expect(props.onFileRenamed).toHaveBeenCalledWith('xml/a.xml', 'xml/sub/a.xml');
      expect(await screen.findByText('Moved file')).toBeInTheDocument();
    });

    it('ignores drops onto the file\'s current folder', async () => {
      const { api } = setup();
      const dt = dataTransfer();
      fireEvent.dragStart(item('a.xml'), { dataTransfer: dt });
      fireEvent.drop(screen.getByText('xml', { selector: '.file-tree-item' }), { dataTransfer: dt });
      await new Promise(r => setTimeout(r, 30));
      expect(api.moveFile).not.toHaveBeenCalled();
    });
  });
});



