export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  originalContent: string;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
}

export interface WorkspaceFiles {
  xml: FileTreeItem[];
  xsl: FileTreeItem[];
}
