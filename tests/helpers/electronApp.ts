import { _electron as electron, ElectronApplication, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fopDir, gsonJar, hasFopSetup, jars, javacBin, javaHome, serverSrc } from './fopEnv';

export const repoRoot = path.resolve(__dirname, '..', '..');

// PDF tests need a real FOP + JDK (env vars or assets/bundled, see fopEnv.ts); otherwise they are skipped.
export const hasFop = hasFopSetup();

const cleanup: string[] = [];

export function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

export function removeTempDirs() {
  for (const dir of cleanup.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chromium may still hold files */ }
  }
}

// Fake "bundled" resources dir: compiled FopServer + gson, so a custom FOP install can be used with the real server code.
function buildBundledDir(): string {
  const dir = tmpDir('fop-e2e-bundled-');
  const server = path.join(dir, 'fop', 'server');
  fs.mkdirSync(server, { recursive: true });
  fs.copyFileSync(gsonJar, path.join(server, 'gson-2.10.1.jar'));
  const cp = [...jars(path.join(fopDir, 'build')), ...jars(path.join(fopDir, 'lib')), gsonJar].join(path.delimiter);
  execFileSync(javacBin, ['-cp', cp, '-d', server, serverSrc], { stdio: 'pipe' });
  return dir;
}

export interface LaunchOptions {
  userData?: string;
  withFop?: boolean;
  lastOpenedWorkspaces?: string[];
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
  close: () => Promise<void>;
  // Next native folder dialog (select-folder) returns this path (or cancels when null)
  stubFolderDialog: (folder: string | null) => Promise<void>;
  // Next shell.trashItem calls delete the file permanently instead of using the OS recycle bin
  stubTrash: () => Promise<void>;
}

export async function launchApp(options: LaunchOptions = {}): Promise<Launched> {
  const userData = options.userData ?? tmpDir('fop-e2e-userdata-');

  const config: Record<string, unknown> = {};
  if (options.lastOpenedWorkspaces) config.lastOpenedWorkspaces = options.lastOpenedWorkspaces;
  const env: Record<string, string> = { ...(process.env as Record<string, string>), FOP_EDITOR_E2E: '1', FOP_EDITOR_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  if (options.withFop) {
    config.fopConfig = { useBundled: false, customFopPath: fopDir };
    config.jreConfig = { useBundled: false, customJrePath: javaHome };
    env.FOP_EDITOR_BUNDLED_DIR = buildBundledDir();
  }
  if (Object.keys(config).length) {
    const file = path.join(userData, 'config.json');
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
    fs.writeFileSync(file, JSON.stringify({ ...existing, ...config }));
  }

  const app = await electron.launch({ args: [repoRoot], env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Native alert()/confirm() would block the renderer; record and accept them
  page.on('dialog', d => d.accept());

  return {
    app,
    page,
    userData,
    close: () => app.close(),
    stubFolderDialog: folder =>
      app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({ canceled: f === null, filePaths: f === null ? [] : [f] })) as any;
      }, folder),
    stubTrash: () =>
      app.evaluate(({ shell }) => {
        const fs = (process as any).getBuiltinModule('fs');
        shell.trashItem = (async (p: string) => fs.rmSync(p, { force: true })) as any;
      }),
  };
}

// Creates a workspace through the UI; the (stubbed) folder dialog supplies the parent folder.
export async function createWorkspaceViaUi(l: Launched, parent: string, name: string) {
  await l.stubFolderDialog(parent);
  await l.page.getByRole('button', { name: 'New Workspace' }).first().click();
  await l.page.getByRole('button', { name: 'Browse...' }).click();
  await expect(l.page.getByPlaceholder('Select where to create workspace...')).toHaveValue(parent);
  await l.page.getByPlaceholder('Enter workspace name...').fill(name);
  await l.page.getByRole('button', { name: 'Create Workspace' }).click();
  await expect(l.page.locator('.workspace-name:visible')).toHaveText(name);
}

export const explorerItem = (page: Page, name: string) =>
  page.locator('.file-tree-item').filter({ hasText: name }).first();



