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

export interface WorkspaceFiles {
  xml: string[];
  xsl: string[];
}
