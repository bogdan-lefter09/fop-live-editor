import path from 'path';
import fs from 'fs';

// Pure filesystem logic for workspaces. No Electron imports so it can be unit tested in plain Node.

const INVALID_NAME_CHARS = /[<>:"|?*\\/]/;

export interface FileTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeEntry[];
}

export interface SearchOptions {
  caseSensitive: boolean;
  useRegex: boolean;
}

export interface SearchMatch {
  line: number;
  column: number;
  text: string;
  matchText: string;
}

export interface SearchFileResult {
  file: string;
  matches: SearchMatch[];
}

function assertValidName(name: string, label: string) {
  if (!name || name.trim() === '') {
    throw new Error(`${label} cannot be empty`);
  }
  if (INVALID_NAME_CHARS.test(name)) {
    throw new Error(`${label} contains invalid characters`);
  }
}

export function toNativePath(relativePath: string): string {
  return relativePath.replace(/\//g, path.sep);
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function getFilesRecursive(folderPath: string, extension: string): string[] {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return [];
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(path.relative(folderPath, fullPath));
      }
    }
  };
  walk(folderPath);
  return files.sort();
}

export function scanWorkspaceFiles(workspacePath: string): { xml: FileTreeEntry[]; xsl: FileTreeEntry[] } {
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    return { xml: [], xsl: [] };
  }

  const scan = (folderPath: string): FileTreeEntry[] => {
    if (!fs.existsSync(folderPath)) {
      return [];
    }
    const items: FileTreeEntry[] = [];
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: entry.name,
          type: 'folder',
          children: scan(path.join(folderPath, entry.name)),
        });
      } else if (entry.isFile()) {
        items.push({ name: entry.name, path: entry.name, type: 'file' });
      }
    }
    items.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'folder' ? -1 : 1;
    });
    return items;
  };

  return {
    xml: scan(path.join(workspacePath, 'xml')),
    xsl: scan(path.join(workspacePath, 'xsl')),
  };
}

function copyFlatFolder(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  let copied = 0;
  for (const file of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(destDir, file));
      copied++;
    }
  }
  return copied;
}

export function createWorkspace(parentFolder: string, workspaceName: string, examplesPath?: string) {
  if (!parentFolder || !workspaceName) {
    throw new Error('Parent folder and workspace name are required');
  }

  const workspacePath = path.join(parentFolder, workspaceName);
  if (fs.existsSync(workspacePath)) {
    throw new Error('Workspace folder already exists');
  }

  const xmlFolder = path.join(workspacePath, 'xml');
  const xslFolder = path.join(workspacePath, 'xsl');
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(xmlFolder, { recursive: true });
  fs.mkdirSync(xslFolder, { recursive: true });

  const workspaceConfig = {
    workspaceName,
    selectedXmlFile: null,
    selectedXslFile: null,
    autoGenerate: true,
    openFiles: [],
  };
  fs.writeFileSync(
    path.join(workspacePath, '.fop-editor-workspace.json'),
    JSON.stringify(workspaceConfig, null, 2),
    'utf-8'
  );

  if (examplesPath && fs.existsSync(examplesPath)) {
    copyFlatFolder(path.join(examplesPath, 'xml'), xmlFolder);
    copyFlatFolder(path.join(examplesPath, 'xsl'), xslFolder);
  }

  return { success: true, workspacePath };
}

export function openFolderAsWorkspace(folderPath: string) {
  if (!folderPath) {
    throw new Error('Folder path is required');
  }
  if (!fs.existsSync(folderPath)) {
    throw new Error('Selected folder does not exist');
  }

  for (const sub of ['xml', 'xsl']) {
    const subPath = path.join(folderPath, sub);
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath, { recursive: true });
    }
  }

  const configPath = path.join(folderPath, '.fop-editor-workspace.json');
  if (!fs.existsSync(configPath)) {
    const workspaceConfig = {
      workspaceName: path.basename(folderPath),
      selectedXmlFile: null,
      selectedXslFile: null,
      autoGenerate: false,
      openFiles: [],
    };
    fs.writeFileSync(configPath, JSON.stringify(workspaceConfig, null, 2), 'utf-8');
  }

  return {
    success: true,
    workspacePath: folderPath,
    workspaceName: path.basename(folderPath),
  };
}

export function loadWorkspaceSettings(workspacePath: string) {
  const configPath = path.join(workspacePath, '.fop-editor-workspace.json');
  if (!fs.existsSync(configPath)) {
    return {
      workspaceName: path.basename(workspacePath),
      selectedXmlFile: '',
      selectedXslFile: '',
      autoGenerate: false,
      openFiles: [],
    };
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function saveWorkspaceSettings(workspacePath: string, settings: unknown) {
  const configPath = path.join(workspacePath, '.fop-editor-workspace.json');
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
  return { success: true };
}

export function createFile(workspacePath: string, folderName: string, fileName: string) {
  assertValidName(fileName, 'Filename');

  const filePath = path.join(workspacePath, folderName, fileName);
  if (fs.existsSync(filePath)) {
    throw new Error('A file with this name already exists');
  }

  const folderPath = path.dirname(filePath);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  fs.writeFileSync(filePath, '', 'utf-8');

  return { success: true, filePath: path.join(folderName, fileName) };
}

export function copyFile(workspacePath: string, sourceRelativePath: string, destFolderRelativePath: string) {
  const sourceFullPath = path.join(workspacePath, toNativePath(sourceRelativePath));

  if (!fs.existsSync(sourceFullPath)) {
    throw new Error('Source file not found');
  }
  if (fs.statSync(sourceFullPath).isDirectory()) {
    throw new Error('Cannot copy folders');
  }

  const destFolderFullPath = path.join(workspacePath, toNativePath(destFolderRelativePath));
  if (!fs.existsSync(destFolderFullPath)) {
    fs.mkdirSync(destFolderFullPath, { recursive: true });
  }

  const originalName = path.basename(sourceFullPath);
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);

  let candidateName = originalName;
  let destFullPath = path.join(destFolderFullPath, candidateName);
  let counter = 1;
  while (fs.existsSync(destFullPath)) {
    candidateName = counter === 1 ? `${baseName} (copy)${ext}` : `${baseName} (copy ${counter})${ext}`;
    destFullPath = path.join(destFolderFullPath, candidateName);
    counter++;
  }

  fs.copyFileSync(sourceFullPath, destFullPath);
  return { success: true, newPath: `${toPosixPath(destFolderRelativePath)}/${candidateName}` };
}

export function moveFile(workspacePath: string, sourceRelativePath: string, destFolderRelativePath: string) {
  const sourceFullPath = path.join(workspacePath, toNativePath(sourceRelativePath));

  if (!fs.existsSync(sourceFullPath)) {
    throw new Error('Source file not found');
  }
  if (fs.statSync(sourceFullPath).isDirectory()) {
    throw new Error('Cannot move folders');
  }

  const destFolderFullPath = path.join(workspacePath, toNativePath(destFolderRelativePath));
  if (!fs.existsSync(destFolderFullPath)) {
    fs.mkdirSync(destFolderFullPath, { recursive: true });
  }

  const fileName = path.basename(sourceFullPath);
  const destFullPath = path.join(destFolderFullPath, fileName);
  const normalizedOldPath = toPosixPath(sourceRelativePath);

  if (path.resolve(destFullPath) === path.resolve(sourceFullPath)) {
    return { success: true, oldPath: normalizedOldPath, newPath: normalizedOldPath };
  }
  if (fs.existsSync(destFullPath)) {
    throw new Error(`A file named "${fileName}" already exists in the destination folder`);
  }

  fs.renameSync(sourceFullPath, destFullPath);
  return {
    success: true,
    oldPath: normalizedOldPath,
    newPath: `${toPosixPath(destFolderRelativePath)}/${fileName}`,
  };
}

export function createFolder(workspacePath: string, parentFolderPath: string, folderName: string) {
  assertValidName(folderName, 'Folder name');

  const fullFolderPath = path.join(workspacePath, parentFolderPath, folderName);
  if (fs.existsSync(fullFolderPath)) {
    throw new Error('A folder with this name already exists');
  }
  fs.mkdirSync(fullFolderPath, { recursive: true });

  return { success: true, folderPath: path.join(parentFolderPath, folderName) };
}

export function deleteFolder(workspacePath: string, folderPath: string) {
  if (folderPath === 'xml' || folderPath === 'xsl') {
    throw new Error('Cannot delete root xml or xsl folders');
  }

  const fullFolderPath = path.join(workspacePath, toNativePath(folderPath));
  if (!isPathInside(workspacePath, fullFolderPath)) {
    throw new Error('Invalid folder path: outside workspace');
  }
  if (!fs.existsSync(fullFolderPath)) {
    throw new Error('Folder not found');
  }
  if (!fs.statSync(fullFolderPath).isDirectory()) {
    throw new Error('Path is not a folder');
  }

  fs.rmSync(fullFolderPath, { recursive: true, force: true });
  return { success: true };
}

export function renameFolder(workspacePath: string, oldFolderPath: string, newFolderName: string) {
  if (oldFolderPath === 'xml' || oldFolderPath === 'xsl') {
    throw new Error('Cannot rename root xml or xsl folders');
  }
  assertValidName(newFolderName, 'Folder name');

  const oldFullPath = path.join(workspacePath, toNativePath(oldFolderPath));
  const parentFolder = path.dirname(oldFullPath);
  const newFullPath = path.join(parentFolder, newFolderName);

  if (!fs.existsSync(oldFullPath)) {
    throw new Error('Folder not found');
  }
  if (!fs.statSync(oldFullPath).isDirectory()) {
    throw new Error('Path is not a folder');
  }
  if (fs.existsSync(newFullPath) && oldFullPath !== newFullPath) {
    throw new Error('A folder with this name already exists');
  }

  fs.renameSync(oldFullPath, newFullPath);

  const parentRelativePath = path.relative(workspacePath, parentFolder);
  const newRelativePath = parentRelativePath ? `${parentRelativePath}${path.sep}${newFolderName}` : newFolderName;

  return { success: true, oldPath: oldFolderPath, newPath: toPosixPath(newRelativePath) };
}

export function renameFile(workspacePath: string, oldRelativePath: string, newFileName: string) {
  assertValidName(newFileName, 'Filename');

  const oldFullPath = path.join(workspacePath, toNativePath(oldRelativePath));
  const folderPath = path.dirname(oldFullPath);
  const newFullPath = path.join(folderPath, newFileName);

  if (!fs.existsSync(oldFullPath)) {
    throw new Error(`Original file not found: ${oldFullPath}`);
  }
  if (fs.existsSync(newFullPath) && oldFullPath !== newFullPath) {
    throw new Error('A file with this name already exists');
  }

  const newRelativePath = `${path.basename(folderPath)}/${newFileName}`;
  fs.renameSync(oldFullPath, newFullPath);

  return { success: true, oldPath: oldRelativePath, newPath: newRelativePath };
}

// `trash` is injected (Electron's shell.trashItem in the app) so deletion can be tested without a recycle bin.
export async function deleteFile(
  workspacePath: string,
  filePath: string,
  trash: (fullPath: string) => Promise<void>
) {
  const fullPath = path.join(workspacePath, toNativePath(filePath));

  if (!fs.existsSync(fullPath)) {
    throw new Error('File not found');
  }
  if (fs.statSync(fullPath).isDirectory()) {
    throw new Error('Cannot delete folders (only files can be deleted)');
  }
  if (!path.resolve(fullPath).startsWith(path.resolve(workspacePath))) {
    throw new Error('Cannot delete file: path is outside workspace');
  }

  await trash(fullPath);
  return { success: true, deletedPath: filePath };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchPattern(query: string, options: SearchOptions): RegExp {
  const flags = options.caseSensitive ? 'g' : 'gi';
  if (options.useRegex) {
    try {
      return new RegExp(query, flags);
    } catch {
      // Invalid regex falls back to a literal search
      return new RegExp(escapeRegExp(query), flags);
    }
  }
  return new RegExp(escapeRegExp(query), flags);
}

export function searchWorkspace(workspacePath: string, searchQuery: string, options: SearchOptions) {
  const results: SearchFileResult[] = [];

  const searchFile = (filePath: string, relativePath: string) => {
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      const pattern = buildSearchPattern(searchQuery, options);
      const fileMatches: SearchMatch[] = [];

      lines.forEach((lineText, lineIndex) => {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(lineText)) !== null) {
          fileMatches.push({
            line: lineIndex + 1,
            column: match.index + 1,
            text: lineText.trim(),
            matchText: match[0],
          });
          // Prevent infinite loop for zero-width matches
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
        }
      });

      if (fileMatches.length > 0) {
        results.push({ file: relativePath, matches: fileMatches });
      }
    } catch (error) {
      console.error(`Error searching file ${filePath}:`, error);
    }
  };

  const searchDirectory = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        searchDirectory(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.xml') || entry.name.endsWith('.xsl') || entry.name.endsWith('.xslt'))
      ) {
        searchFile(fullPath, toPosixPath(path.relative(workspacePath, fullPath)));
      }
    }
  };

  searchDirectory(path.join(workspacePath, 'xml'));
  searchDirectory(path.join(workspacePath, 'xsl'));

  return { success: true, results };
}

export function validateFopDirectory(fopPath: string): { valid: boolean; error?: string; fopJar?: string } {
  try {
    if (!fopPath || !fs.existsSync(fopPath)) {
      return { valid: false, error: 'Directory does not exist' };
    }

    const buildDir = path.join(fopPath, 'build');
    const libDir = path.join(fopPath, 'lib');
    if (!fs.existsSync(buildDir)) {
      return { valid: false, error: 'Missing build directory' };
    }
    if (!fs.existsSync(libDir)) {
      return { valid: false, error: 'Missing lib directory' };
    }

    const fopJars = fs.readdirSync(buildDir).filter(f => f.startsWith('fop') && f.endsWith('.jar'));
    if (fopJars.length === 0) {
      return { valid: false, error: 'No FOP JAR found in build directory' };
    }
    return { valid: true, fopJar: fopJars[0] };
  } catch (error) {
    console.error('Error validating FOP directory:', error);
    return { valid: false, error: 'Failed to validate directory' };
  }
}

export function validateJreDirectory(jrePath: string): { valid: boolean; error?: string } {
  try {
    if (!jrePath || !fs.existsSync(jrePath)) {
      return { valid: false, error: 'Directory does not exist' };
    }
    if (!fs.existsSync(path.join(jrePath, 'bin', 'java.exe'))) {
      return { valid: false, error: 'No bin/java.exe found in this directory' };
    }
    return { valid: true };
  } catch (error) {
    console.error('Error validating JRE directory:', error);
    return { valid: false, error: 'Failed to validate directory' };
  }
}
