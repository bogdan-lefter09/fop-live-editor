import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import * as ops from '../../src/main/workspaceOps';
import { cleanupTempDirs, exists, makeWorkspace, read, write } from '../helpers/tmp';

afterEach(cleanupTempDirs);

describe('createFile', () => {
  it('creates an empty file and returns the workspace-relative path', () => {
    const ws = makeWorkspace();
    const result = ops.createFile(ws, 'xml', 'new.xml');
    expect(result).toEqual({ success: true, filePath: path.join('xml', 'new.xml') });
    expect(read(ws, 'xml/new.xml')).toBe('');
  });

  it('creates missing parent folders', () => {
    const ws = makeWorkspace();
    ops.createFile(ws, 'xml/deep/er', 'a.xml');
    expect(exists(ws, 'xml/deep/er/a.xml')).toBe(true);
  });

  it.each(['', '   '])('rejects empty name %j', name => {
    expect(() => ops.createFile(makeWorkspace(), 'xml', name)).toThrow('Filename cannot be empty');
  });

  it.each(['a<b.xml', 'a>b.xml', 'a:b.xml', 'a"b.xml', 'a|b.xml', 'a?b.xml', 'a*b.xml', 'a\\b.xml', 'a/b.xml'])(
    'rejects invalid characters in %s',
    name => {
      expect(() => ops.createFile(makeWorkspace(), 'xml', name)).toThrow('Filename contains invalid characters');
    }
  );

  it('does not overwrite an existing file', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'keep me');
    expect(() => ops.createFile(ws, 'xml', 'a.xml')).toThrow('A file with this name already exists');
    expect(read(ws, 'xml/a.xml')).toBe('keep me');
  });
});

describe('renameFile', () => {
  it('renames on disk and returns forward-slash paths', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    expect(ops.renameFile(ws, 'xml/a.xml', 'b.xml')).toEqual({
      success: true,
      oldPath: 'xml/a.xml',
      newPath: 'xml/b.xml',
    });
    expect(exists(ws, 'xml/a.xml')).toBe(false);
    expect(read(ws, 'xml/b.xml')).toBe('data');
  });

  it('returns only the immediate parent folder name for nested files', () => {
    const ws = makeWorkspace();
    write(ws, 'xsl/sub/a.xsl', 'x');
    const result = ops.renameFile(ws, 'xsl/sub/a.xsl', 'b.xsl');
    expect(result.newPath).toBe('sub/b.xsl');
    expect(exists(ws, 'xsl/sub/b.xsl')).toBe(true);
  });

  it('rejects a missing source', () => {
    expect(() => ops.renameFile(makeWorkspace(), 'xml/nope.xml', 'b.xml')).toThrow('Original file not found');
  });

  it('rejects a name collision and leaves both files intact', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'A');
    write(ws, 'xml/b.xml', 'B');
    expect(() => ops.renameFile(ws, 'xml/a.xml', 'b.xml')).toThrow('A file with this name already exists');
    expect(read(ws, 'xml/a.xml')).toBe('A');
    expect(read(ws, 'xml/b.xml')).toBe('B');
  });

  it('rejects invalid and empty names', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml');
    expect(() => ops.renameFile(ws, 'xml/a.xml', '')).toThrow('Filename cannot be empty');
    expect(() => ops.renameFile(ws, 'xml/a.xml', '../evil.xml')).toThrow('invalid characters');
  });
});

describe('copyFile', () => {
  it('copies into the destination folder', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    const result = ops.copyFile(ws, 'xml/a.xml', 'xsl');
    expect(result).toEqual({ success: true, newPath: 'xsl/a.xml' });
    expect(read(ws, 'xsl/a.xml')).toBe('data');
    expect(read(ws, 'xml/a.xml')).toBe('data');
  });

  it('auto-renames to " (copy)", " (copy 2)", ... on collisions', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    expect(ops.copyFile(ws, 'xml/a.xml', 'xml').newPath).toBe('xml/a (copy).xml');
    expect(ops.copyFile(ws, 'xml/a.xml', 'xml').newPath).toBe('xml/a (copy 2).xml');
    expect(ops.copyFile(ws, 'xml/a.xml', 'xml').newPath).toBe('xml/a (copy 3).xml');
    expect(exists(ws, 'xml/a (copy 3).xml')).toBe(true);
  });

  it('creates the destination folder if missing', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    ops.copyFile(ws, 'xml/a.xml', 'xml/new');
    expect(exists(ws, 'xml/new/a.xml')).toBe(true);
  });

  it('rejects missing sources and folders', () => {
    const ws = makeWorkspace();
    fs.mkdirSync(path.join(ws, 'xml', 'dir'));
    expect(() => ops.copyFile(ws, 'xml/nope.xml', 'xsl')).toThrow('Source file not found');
    expect(() => ops.copyFile(ws, 'xml/dir', 'xsl')).toThrow('Cannot copy folders');
  });
});

describe('moveFile', () => {
  it('moves a file between folders', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    fs.mkdirSync(path.join(ws, 'xml', 'sub'));
    expect(ops.moveFile(ws, 'xml/a.xml', 'xml/sub')).toEqual({
      success: true,
      oldPath: 'xml/a.xml',
      newPath: 'xml/sub/a.xml',
    });
    expect(exists(ws, 'xml/a.xml')).toBe(false);
    expect(read(ws, 'xml/sub/a.xml')).toBe('data');
  });

  it('is a no-op when the file is already in the destination', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    const result = ops.moveFile(ws, 'xml/a.xml', 'xml');
    expect(result.oldPath).toBe(result.newPath);
    expect(read(ws, 'xml/a.xml')).toBe('data');
  });

  it('refuses to overwrite an existing file in the destination', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'src');
    write(ws, 'xml/sub/a.xml', 'dest');
    expect(() => ops.moveFile(ws, 'xml/a.xml', 'xml/sub')).toThrow('already exists in the destination folder');
    expect(read(ws, 'xml/a.xml')).toBe('src');
    expect(read(ws, 'xml/sub/a.xml')).toBe('dest');
  });

  it('rejects missing sources and folders', () => {
    const ws = makeWorkspace();
    fs.mkdirSync(path.join(ws, 'xml', 'dir'));
    expect(() => ops.moveFile(ws, 'xml/nope.xml', 'xsl')).toThrow('Source file not found');
    expect(() => ops.moveFile(ws, 'xml/dir', 'xsl')).toThrow('Cannot move folders');
  });

  it('accepts backslash-separated source paths', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'data');
    const result = ops.moveFile(ws, 'xml\\a.xml', 'xsl');
    expect(result.oldPath).toBe('xml/a.xml');
    expect(exists(ws, 'xsl/a.xml')).toBe(true);
  });
});

describe('deleteFile', () => {
  it('hands the full path to the trash function', async () => {
    const ws = makeWorkspace();
    const full = write(ws, 'xml/a.xml');
    const trash = vi.fn(async () => {});
    const result = await ops.deleteFile(ws, 'xml/a.xml', trash);
    expect(result).toEqual({ success: true, deletedPath: 'xml/a.xml' });
    expect(trash).toHaveBeenCalledWith(full);
  });

  it('rejects missing files, folders and paths outside the workspace without trashing', async () => {
    const ws = makeWorkspace();
    fs.mkdirSync(path.join(ws, 'xml', 'dir'));
    const outside = write(path.dirname(ws), `outside-${path.basename(ws)}.txt`, 'x');
    const trash = vi.fn(async () => {});

    await expect(ops.deleteFile(ws, 'xml/nope.xml', trash)).rejects.toThrow('File not found');
    await expect(ops.deleteFile(ws, 'xml/dir', trash)).rejects.toThrow('Cannot delete folders');
    await expect(ops.deleteFile(ws, `../${path.basename(outside)}`, trash)).rejects.toThrow('outside workspace');
    expect(trash).not.toHaveBeenCalled();
    fs.rmSync(outside);
  });

  it('propagates trash failures', async () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml');
    await expect(ops.deleteFile(ws, 'xml/a.xml', async () => { throw new Error('trash failed'); })).rejects.toThrow(
      'trash failed'
    );
  });
});
