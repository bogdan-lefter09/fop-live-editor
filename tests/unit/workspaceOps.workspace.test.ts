import { afterEach, describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';
import * as ops from '../../src/main/workspaceOps';
import { cleanupTempDirs, exists, makeTempDir, makeWorkspace, read, write } from '../helpers/tmp';

afterEach(cleanupTempDirs);

const CONFIG = '.fop-editor-workspace.json';

describe('path helpers', () => {
  it('converts between posix and native separators', () => {
    expect(ops.toPosixPath('a\\b\\c')).toBe('a/b/c');
    expect(ops.toNativePath('a/b/c')).toBe(['a', 'b', 'c'].join(path.sep));
  });

  it('isPathInside detects containment and escapes', () => {
    const root = path.resolve('/tmp/root');
    expect(ops.isPathInside(root, path.join(root, 'a', 'b'))).toBe(true);
    expect(ops.isPathInside(root, root)).toBe(true);
    expect(ops.isPathInside(root, path.resolve(root, '..', 'other'))).toBe(false);
  });
});

describe('createWorkspace', () => {
  it('creates xml/xsl folders and a config with autoGenerate enabled', () => {
    const parent = makeTempDir();
    const result = ops.createWorkspace(parent, 'My WS');
    expect(result.workspacePath).toBe(path.join(parent, 'My WS'));
    expect(exists(result.workspacePath, 'xml')).toBe(true);
    expect(exists(result.workspacePath, 'xsl')).toBe(true);
    expect(JSON.parse(read(result.workspacePath, CONFIG))).toEqual({
      workspaceName: 'My WS',
      selectedXmlFile: null,
      selectedXslFile: null,
      autoGenerate: true,
      openFiles: [],
    });
  });

  it('copies example files when an examples path is given', () => {
    const parent = makeTempDir();
    const examples = makeTempDir();
    write(examples, 'xml/a.xml', '<a/>');
    write(examples, 'xsl/a.xsl', '<x/>');
    const { workspacePath } = ops.createWorkspace(parent, 'ws', examples);
    expect(read(workspacePath, 'xml/a.xml')).toBe('<a/>');
    expect(read(workspacePath, 'xsl/a.xsl')).toBe('<x/>');
  });

  it('ignores a missing examples path', () => {
    const parent = makeTempDir();
    expect(() => ops.createWorkspace(parent, 'ws', path.join(parent, 'nope'))).not.toThrow();
  });

  it('validates input and refuses to reuse an existing folder', () => {
    const parent = makeTempDir();
    expect(() => ops.createWorkspace('', 'x')).toThrow('Parent folder and workspace name are required');
    expect(() => ops.createWorkspace(parent, '')).toThrow('Parent folder and workspace name are required');
    ops.createWorkspace(parent, 'ws');
    expect(() => ops.createWorkspace(parent, 'ws')).toThrow('Workspace folder already exists');
  });
});

describe('openFolderAsWorkspace', () => {
  it('adds missing xml/xsl folders and a config with autoGenerate disabled', () => {
    const folder = makeTempDir('plain-');
    const result = ops.openFolderAsWorkspace(folder);
    expect(result).toEqual({ success: true, workspacePath: folder, workspaceName: path.basename(folder) });
    expect(exists(folder, 'xml')).toBe(true);
    expect(exists(folder, 'xsl')).toBe(true);
    expect(JSON.parse(read(folder, CONFIG)).autoGenerate).toBe(false);
  });

  it('keeps an existing config untouched', () => {
    const folder = makeTempDir();
    write(folder, CONFIG, '{"workspaceName":"keep","autoGenerate":true}');
    ops.openFolderAsWorkspace(folder);
    expect(read(folder, CONFIG)).toBe('{"workspaceName":"keep","autoGenerate":true}');
  });

  it('validates the folder', () => {
    expect(() => ops.openFolderAsWorkspace('')).toThrow('Folder path is required');
    expect(() => ops.openFolderAsWorkspace(path.join(makeTempDir(), 'missing'))).toThrow(
      'Selected folder does not exist'
    );
  });
});

describe('workspace settings', () => {
  it('returns defaults when there is no config', () => {
    const ws = makeWorkspace();
    expect(ops.loadWorkspaceSettings(ws)).toEqual({
      workspaceName: path.basename(ws),
      selectedXmlFile: '',
      selectedXslFile: '',
      autoGenerate: false,
      openFiles: [],
    });
  });

  it('round-trips saved settings', () => {
    const ws = makeWorkspace();
    const settings = { workspaceName: 'w', selectedXmlFile: 'a.xml', selectedXslFile: 'b.xsl', autoGenerate: true, openFiles: ['xml/a.xml'] };
    expect(ops.saveWorkspaceSettings(ws, settings)).toEqual({ success: true });
    expect(ops.loadWorkspaceSettings(ws)).toEqual(settings);
  });

  it('throws on a corrupt config', () => {
    const ws = makeWorkspace();
    write(ws, CONFIG, '{not json');
    expect(() => ops.loadWorkspaceSettings(ws)).toThrow();
  });
});

describe('scanWorkspaceFiles', () => {
  it('returns empty trees for missing workspaces', () => {
    expect(ops.scanWorkspaceFiles('')).toEqual({ xml: [], xsl: [] });
    expect(ops.scanWorkspaceFiles(path.join(makeTempDir(), 'nope'))).toEqual({ xml: [], xsl: [] });
  });

  it('builds a tree with folders first, then alphabetical files', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/b.xml');
    write(ws, 'xml/a.xml');
    write(ws, 'xml/zdir/inner.xml');
    write(ws, 'xml/adir/x.xml');
    write(ws, 'xsl/s.xsl');
    const { xml, xsl } = ops.scanWorkspaceFiles(ws);
    expect(xml.map(e => `${e.type}:${e.name}`)).toEqual(['folder:adir', 'folder:zdir', 'file:a.xml', 'file:b.xml']);
    expect(xml[1].children).toEqual([{ name: 'inner.xml', path: 'inner.xml', type: 'file' }]);
    expect(xsl).toEqual([{ name: 's.xsl', path: 's.xsl', type: 'file' }]);
  });

  it('tolerates a workspace without xml/xsl folders', () => {
    const ws = makeTempDir();
    expect(ops.scanWorkspaceFiles(ws)).toEqual({ xml: [], xsl: [] });
  });
});

describe('getFilesRecursive', () => {
  it('lists matching files recursively, sorted, relative to the folder', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/b.xml');
    write(ws, 'xml/sub/a.xml');
    write(ws, 'xml/notes.txt');
    const files = ops.getFilesRecursive(path.join(ws, 'xml'), '.xml');
    expect(files).toEqual(['b.xml', path.join('sub', 'a.xml')].sort());
  });

  it('returns [] for missing or empty paths', () => {
    expect(ops.getFilesRecursive('', '.xml')).toEqual([]);
    expect(ops.getFilesRecursive(path.join(makeTempDir(), 'x'), '.xml')).toEqual([]);
  });
});

describe('searchWorkspace', () => {
  const opts = { caseSensitive: false, useRegex: false };

  it('finds matches with 1-based line/column and posix file paths', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/sub/a.xml', 'first\n  <Invoice id="1"/>\nlast');
    const { success, results } = ops.searchWorkspace(ws, 'invoice', opts);
    expect(success).toBe(true);
    expect(results).toEqual([
      { file: 'xml/sub/a.xml', matches: [{ line: 2, column: 4, text: '<Invoice id="1"/>', matchText: 'Invoice' }] },
    ]);
  });

  it('respects case sensitivity', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'Hello hello');
    expect(ops.searchWorkspace(ws, 'hello', { ...opts, caseSensitive: true }).results[0].matches).toHaveLength(1);
    expect(ops.searchWorkspace(ws, 'hello', opts).results[0].matches).toHaveLength(2);
  });

  it('treats the query literally unless regex mode is on', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'a.c abc');
    expect(ops.searchWorkspace(ws, 'a.c', opts).results[0].matches).toHaveLength(1);
    expect(ops.searchWorkspace(ws, 'a.c', { ...opts, useRegex: true }).results[0].matches).toHaveLength(2);
  });

  it('falls back to a literal search for an invalid regex', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'x(y z(');
    const { results } = ops.searchWorkspace(ws, '(', { ...opts, useRegex: true });
    expect(results[0].matches).toHaveLength(2);
  });

  it('does not hang on zero-width regex matches', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'abc');
    const { results } = ops.searchWorkspace(ws, 'x*', { ...opts, useRegex: true });
    expect(results[0].matches.length).toBeGreaterThan(0);
  });

  it('searches only xml/xsl/xslt files inside xml and xsl folders', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'needle');
    write(ws, 'xsl/b.xsl', 'needle');
    write(ws, 'xsl/c.xslt', 'needle');
    write(ws, 'xml/d.txt', 'needle');
    write(ws, 'other/e.xml', 'needle');
    const files = ops.searchWorkspace(ws, 'needle', opts).results.map(r => r.file).sort();
    expect(files).toEqual(['xml/a.xml', 'xsl/b.xsl', 'xsl/c.xslt']);
  });

  it('returns no results when nothing matches or folders are missing', () => {
    expect(ops.searchWorkspace(makeTempDir(), 'x', opts).results).toEqual([]);
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'abc');
    expect(ops.searchWorkspace(ws, 'zzz', opts).results).toEqual([]);
  });

  it('finds multiple matches on the same line', () => {
    const ws = makeWorkspace();
    write(ws, 'xml/a.xml', 'aa aa');
    const matches = ops.searchWorkspace(ws, 'aa', opts).results[0].matches;
    expect(matches.map(m => m.column)).toEqual([1, 4]);
  });
});

describe('validateFopDirectory', () => {
  it('reports each kind of invalid install', () => {
    const dir = makeTempDir();
    expect(ops.validateFopDirectory('')).toEqual({ valid: false, error: 'Directory does not exist' });
    expect(ops.validateFopDirectory(dir).error).toBe('Missing build directory');
    fs.mkdirSync(path.join(dir, 'build'));
    expect(ops.validateFopDirectory(dir).error).toBe('Missing lib directory');
    fs.mkdirSync(path.join(dir, 'lib'));
    expect(ops.validateFopDirectory(dir).error).toBe('No FOP JAR found in build directory');
  });

  it('accepts a directory with a fop jar', () => {
    const dir = makeTempDir();
    write(dir, 'build/fop-2.11.jar');
    fs.mkdirSync(path.join(dir, 'lib'));
    expect(ops.validateFopDirectory(dir)).toEqual({ valid: true, fopJar: 'fop-2.11.jar' });
  });
});

describe('validateJreDirectory', () => {
  it('requires bin/java.exe', () => {
    const dir = makeTempDir();
    expect(ops.validateJreDirectory(path.join(dir, 'nope'))).toEqual({ valid: false, error: 'Directory does not exist' });
    expect(ops.validateJreDirectory(dir).error).toBe('No bin/java.exe found in this directory');
    write(dir, 'bin/java.exe');
    expect(ops.validateJreDirectory(dir)).toEqual({ valid: true });
  });
});
