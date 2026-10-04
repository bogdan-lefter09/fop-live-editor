import fs from 'fs';
import os from 'os';
import path from 'path';

const created: string[] = [];

export function makeTempDir(prefix = 'fop-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export function cleanupTempDirs() {
  while (created.length) {
    const dir = created.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function write(root: string, relativePath: string, content = ''): string {
  const full = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

export function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf-8');
}

export function exists(root: string, relativePath: string): boolean {
  return fs.existsSync(path.join(root, ...relativePath.split('/')));
}

// Workspace with the xml/ and xsl/ root folders every FOP workspace has.
export function makeWorkspace(): string {
  const ws = makeTempDir('fop-ws-');
  fs.mkdirSync(path.join(ws, 'xml'));
  fs.mkdirSync(path.join(ws, 'xsl'));
  return ws;
}
