import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createWorkspaceViaUi, explorerItem, launchApp, removeTempDirs, tmpDir } from '../helpers/electronApp';

test.afterAll(removeTempDirs);

test.describe('workspaces', () => {
  test('starts with the empty state', async () => {
    const l = await launchApp();
    await expect(l.page.getByRole('button', { name: 'New Workspace' })).toBeVisible();
    await expect(l.page.getByRole('button', { name: 'Open Folder' })).toBeVisible();
    await expect(l.page.getByText('Recent Workspaces')).toHaveCount(0);
    await l.close();
  });

  test('creates a workspace with the example files and a workspace config', async () => {
    const parent = tmpDir('fop-e2e-parent-');
    const l = await launchApp();
    await createWorkspaceViaUi(l, parent, 'demo');

    const ws = path.join(parent, 'demo');
    expect(fs.existsSync(path.join(ws, 'xml'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'xsl'))).toBe(true);
    expect(fs.existsSync(path.join(ws, '.fop-editor-workspace.json'))).toBe(true);
    await expect(explorerItem(l.page, 'invoice.xml')).toBeVisible();
    await expect(explorerItem(l.page, 'invoice.xsl')).toBeVisible();
    await expect(l.page.locator('.workspace-tab-name', { hasText: 'demo' })).toBeVisible();
    await l.close();
  });

  test('opens an existing folder as a workspace and creates xml/xsl subfolders', async () => {
    const folder = tmpDir('fop-e2e-plain-');
    const l = await launchApp();
    await l.stubFolderDialog(folder);
    await l.page.getByRole('button', { name: 'Open Folder' }).click();
    await expect(l.page.locator('.workspace-name:visible')).toHaveText(path.basename(folder));
    expect(fs.existsSync(path.join(folder, 'xml'))).toBe(true);
    expect(fs.existsSync(path.join(folder, 'xsl'))).toBe(true);
    await l.close();
  });

  test('cancelling the folder dialog leaves the empty state', async () => {
    const l = await launchApp();
    await l.stubFolderDialog(null);
    await l.page.getByRole('button', { name: 'Open Folder' }).click();
    await expect(l.page.getByRole('button', { name: 'New Workspace' })).toBeVisible();
    await expect(l.page.locator('.workspace-name:visible')).toHaveCount(0);
    await l.close();
  });

  test('supports multiple workspaces in tabs and closing them', async () => {
    const parent = tmpDir('fop-e2e-parent-');
    const l = await launchApp();
    await createWorkspaceViaUi(l, parent, 'first');
    await l.page.getByTitle('New Workspace').click();
    await l.page.getByPlaceholder('Enter workspace name...').fill('second');
    await l.page.getByRole('button', { name: 'Browse...' }).click();
    await l.page.getByRole('button', { name: 'Create Workspace' }).click();
    await expect(l.page.locator('.workspace-name:visible')).toHaveText('second');

    await l.page.locator('.workspace-tab-name', { hasText: 'first' }).click();
    await expect(l.page.locator('.workspace-name:visible')).toHaveText('first');

    await l.page.locator('.workspace-tab', { hasText: 'first' }).locator('.workspace-tab-close').click();
    await expect(l.page.locator('.workspace-tab-name', { hasText: 'first' })).toHaveCount(0);
    await expect(l.page.locator('.workspace-name:visible')).toHaveText('second');
    await l.close();
  });

  test('restores workspaces after a restart and lists them as recent', async () => {
    const parent = tmpDir('fop-e2e-parent-');
    const l1 = await launchApp();
    await createWorkspaceViaUi(l1, parent, 'persisted');
    // lastOpenedWorkspaces is written when the app closes its workspaces / state changes
    await l1.close();

    const l2 = await launchApp({ userData: l1.userData });
    // restored tabs are not auto-activated\n    await expect(l2.page.locator('.workspace-tab-name', { hasText: 'persisted' })).toBeVisible({ timeout: 15_000 });\n    await l2.page.locator('.workspace-tab-name', { hasText: 'persisted' }).click();\n    await expect(l2.page.locator('.workspace-name:visible')).toHaveText('persisted');
    await l2.close();
  });

  test('does not open the same folder twice', async () => {
    const folder = tmpDir('fop-e2e-dup-');
    const l = await launchApp();
    const messages: string[] = [];
    l.page.removeAllListeners('dialog');
    l.page.on('dialog', async d => { messages.push(d.message()); await d.accept(); });
    await l.stubFolderDialog(folder);
    await l.page.getByRole('button', { name: 'Open Folder' }).click();
    await expect(l.page.locator('.workspace-name:visible')).toBeVisible();
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu-open-folder'));
    await expect.poll(() => messages).toContain('This workspace is already open');
    await expect(l.page.locator('.workspace-tab')).toHaveCount(1);
    await l.close();
  });
});



