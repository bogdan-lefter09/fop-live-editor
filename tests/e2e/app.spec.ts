import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createWorkspaceViaUi, explorerItem, hasFop, launchApp, Launched, removeTempDirs, tmpDir } from '../helpers/electronApp';

test.afterAll(removeTempDirs);

async function openWorkspace(withFop = false) {
  const parent = tmpDir('fop-e2e-parent-');
  const l = await launchApp({ withFop });
  await createWorkspaceViaUi(l, parent, 'ws');
  return { l, ws: path.join(parent, 'ws') };
}

async function nameInput(l: Launched, text: string) {
  const input = l.page.locator('.file-name-input');
  await input.fill(text);
  await input.press('Enter');
}

test.describe('file explorer', () => {
  test('creates, renames and deletes a file via the context menu', async () => {
    const { l, ws } = await openWorkspace();
    await l.stubTrash();

    await l.page.locator('.file-tree-item.folder', { hasText: 'xml' }).first().click({ button: 'right' });
    await l.page.locator('.context-menu-item', { hasText: 'New File' }).click();
    await nameInput(l, 'fresh.xml');
    await expect(explorerItem(l.page, 'fresh.xml')).toBeVisible();
    expect(fs.existsSync(path.join(ws, 'xml', 'fresh.xml'))).toBe(true);

    await explorerItem(l.page, 'fresh.xml').click({ button: 'right' });
    await l.page.locator('.context-menu-item', { hasText: 'Rename' }).click();
    await nameInput(l, 'renamed.xml');
    await expect(explorerItem(l.page, 'renamed.xml')).toBeVisible();
    expect(fs.existsSync(path.join(ws, 'xml', 'renamed.xml'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'xml', 'fresh.xml'))).toBe(false);

    await explorerItem(l.page, 'renamed.xml').click({ button: 'right' });
    await l.page.locator('.context-menu-item', { hasText: /^Delete$/ }).click();
    await l.page.locator('.modal-overlay, .dialog-overlay, [class*="overlay"]').getByRole('button', { name: /delete/i }).click();
    await expect(explorerItem(l.page, 'renamed.xml')).toHaveCount(0);
    expect(fs.existsSync(path.join(ws, 'xml', 'renamed.xml'))).toBe(false);
    await l.close();
  });

  test('shows a validation error for an invalid file name', async () => {
    const { l } = await openWorkspace();
    await l.page.locator('.file-tree-item.folder', { hasText: 'xsl' }).first().click({ button: 'right' });
    await l.page.locator('.context-menu-item', { hasText: 'New File' }).click();
    await nameInput(l, '   ');
    await expect(l.page.locator('.file-create-error')).toBeVisible();
    await l.close();
  });

  test('opens a file in the editor and shows it as a tab', async () => {
    const { l } = await openWorkspace();
    await explorerItem(l.page, 'invoice.xml').click();
    await expect(l.page.locator('.tab-name', { hasText: 'invoice.xml' })).toBeVisible();
    await l.close();
  });
});

test.describe('search', () => {
  test('finds text across workspace files', async () => {
    const { l, ws } = await openWorkspace();
    fs.writeFileSync(path.join(ws, 'xml', 'needle.xml'), '<root>unique-needle-token</root>');
    await l.page.getByTitle('Search').click();
    await l.page.getByPlaceholder('Search...').fill('unique-needle-token');
    await expect(l.page.locator('.search-file-name', { hasText: 'needle.xml' })).toBeVisible();
    await l.close();
  });
});

test.describe('settings', () => {
  test('settings dialog opens and closes', async () => {
    const { l } = await openWorkspace();
    await l.page.getByTitle('Settings').click();
    await expect(l.page.getByRole('heading', { name: /settings/i }).first()).toBeVisible();
    await l.page.locator('.close-button').click();
    await expect(l.page.locator('.close-button')).toHaveCount(0);
    await l.close();
  });
});

test.describe('PDF generation (needs real FOP)', () => {
  test.skip(!hasFop, 'Set FOP_DIR, GSON_JAR and FOP_JAVA_HOME/JAVA_HOME to run');

  async function selectFiles(l: Launched, xml: string, xsl: string) {
    await l.page.locator('select').nth(0).selectOption({ label: xml });
    await l.page.locator('select').nth(1).selectOption({ label: xsl });
  }

  test('generates a PDF for the selected XML + XSL', async () => {
    const { l } = await openWorkspace(true);
    await selectFiles(l, 'invoice.xml', 'invoice.xsl');
    await l.page.getByRole('button', { name: /generate/i }).first().click();
    await expect(l.page.locator('iframe[title="PDF Preview - ws"]')).toBeVisible({ timeout: 60_000 });
    const src = await l.page.locator('iframe[title="PDF Preview - ws"]').getAttribute('src');
    expect(src).toMatch(/^file:\/\/\/.*\.pdf/);
    const pdfFile = decodeURI(src!.replace('file:///', '').split('?')[0]);
    expect(fs.readFileSync(pdfFile).subarray(0, 4).toString()).toBe('%PDF');
    await l.close();
  });

  test('shows a failure for a broken XML file', async () => {
    const { l, ws } = await openWorkspace(true);
    fs.writeFileSync(path.join(ws, 'xml', 'broken.xml'), '<root><unclosed></root>');
    await expect(explorerItem(l.page, 'broken.xml')).toBeVisible({ timeout: 10_000 });
    await selectFiles(l, 'broken.xml', 'invoice.xsl');
    await l.page.getByRole('button', { name: /generate/i }).first().click();
    await expect(l.page.getByText('PDF Generation Failed')).toBeVisible({ timeout: 60_000 });
    await l.close();
  });
});





