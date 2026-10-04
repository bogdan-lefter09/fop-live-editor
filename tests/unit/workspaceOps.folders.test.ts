import { afterEach, describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';
import * as ops from '../../src/main/workspaceOps';
import { cleanupTempDirs, exists, makeWorkspace, write } from '../helpers/tmp';

afterEach(cleanupTempDirs);

describe('createFolder', () => {
  it('creates a nested folder and returns its relative path', () => {
    const ws = makeWorkspace();
    expect(ops.createFolder(ws, 'xml', 'sub')).toEqual({ success: true, folderPath: path.join('xml', 'sub') });
    expect(fs.statSync(path.join(ws, 'xml', 'sub')).isDirectory()).toBe(true);
  });

  it('rejects empty names, invalid characters and duplicates', () => {
    const ws = makeWorkspace();
    ops.createFolder(ws, 'xml', 'sub');
    expect(() => ops.createFolder(ws, 'xml', ' ')).toThrow('Folder name cannot be empty');
    expect(() => ops.createFolder(ws, 'xml', 'a/b')).toThrow('Folder name contains invalid characters');
    expect(() => ops.createFolder(ws, 'xml', '..\\x')).toThrow('invalid characters');
    expect(() => ops.createFolder(ws, 'xml', 'sub')).toThrow('A folder with this name already exists');
  });
});

describe('renameFolder', () => {
  it('renames a folder and keeps its contents', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/old/a.xml', 'x');
    expect(ops.renameFolder(ws, 'xml/old', 'new')).toEqual({ success: true, oldPath: 'xml/old', newPath: 'xml/new' });
    expect(exists(ws, 'xml/new/a.xml')).toBe(true);
    expect(exists(ws, 'xml/old')).toBe(false);
  });

  it('renames nested folders and returns forward slashes', () => {
    const ws = makeWorkspace();
    write(ws, 'xsl/a/b/f.xsl');
    expect(ops.renameFolder(ws, 'xsl/a/b', 'c').newPath).toBe('xsl/a/c');
  });

  it('protects the root xml and xsl folders', () => {
    const ws = makeWorkspace();
    expect(() => ops.renameFolder(ws, 'xml', 'other')).toThrow('Cannot rename root xml or xsl folders');
    expect(() => ops.renameFolder(ws, 'xsl', 'other')).toThrow('Cannot rename root xml or xsl folders');
  });

  it('rejects invalid names, missing folders, files and collisions', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a/f.xml');
    fs.mkdirSync(path.join(ws, 'xml', 'b'));
    write(ws, 'xml/file.xml');
    expect(() => ops.renameFolder(ws, 'xml/a', '')).toThrow('Folder name cannot be empty');
    expect(() => ops.renameFolder(ws, 'xml/a', 'x*y')).toThrow('invalid characters');
    expect(() => ops.renameFolder(ws, 'xml/nope', 'z')).toThrow('Folder not found');
    expect(() => ops.renameFolder(ws, 'xml/file.xml', 'z')).toThrow('Path is not a folder');
    expect(() => ops.renameFolder(ws, 'xml/a', 'b')).toThrow('A folder with this name already exists');
  });
});

describe('deleteFolder', () => {
  it('deletes a folder recursively', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/sub/deep/a.xml');
    expect(ops.deleteFolder(ws, 'xml/sub')).toEqual({ success: true });
    expect(exists(ws, 'xml/sub')).toBe(false);
    expect(exists(ws, 'xml')).toBe(true);
  });

  it('protects the root xml and xsl folders', () => {
    const ws = makeWorkspace();
    expect(() => ops.deleteFolder(ws, 'xml')).toThrow('Cannot delete root xml or xsl folders');
    expect(() => ops.deleteFolder(ws, 'xsl')).toThrow('Cannot delete root xml or xsl folders');
    expect(exists(ws, 'xml')).toBe(true);
  });

  it('refuses paths that escape the workspace', () => {
    const ws = makeWorkspace();
    const sibling = path.join(path.dirname(ws), `sibling-${path.basename(ws)}`);
    fs.mkdirSync(sibling);
    expect(() => ops.deleteFolder(ws, `../${path.basename(sibling)}`)).toThrow('outside workspace');
    expect(fs.existsSync(sibling)).toBe(true);
    fs.rmSync(sibling, { recursive: true });
  });

  it('rejects missing folders and files', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml');
    expect(() => ops.deleteFolder(ws, 'xml/nope')).toThrow('Folder not found');
    expect(() => ops.deleteFolder(ws, 'xml/a.xml')).toThrow('Path is not a folder');
  });
});
