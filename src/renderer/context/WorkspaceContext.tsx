import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { Workspace, OpenFile, WorkspaceFiles } from '../types';

interface WorkspaceContextType {
  // Workspace state
  workspaces: Workspace[];
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string | null>>;
  activeWorkspace: Workspace | undefined;

  // UI state
  showWorkspaceForm: boolean;
  setShowWorkspaceForm: React.Dispatch<React.SetStateAction<boolean>>;
  showFileExplorer: boolean;
  setShowFileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;

  // Files state
  workspaceFiles: WorkspaceFiles;
  setWorkspaceFiles: React.Dispatch<React.SetStateAction<WorkspaceFiles>>;
  openFiles: OpenFile[];
  setOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>;
  activeFileIndex: number;
  setActiveFileIndex: React.Dispatch<React.SetStateAction<number>>;
  editorReloadKey: number;
  setEditorReloadKey: React.Dispatch<React.SetStateAction<number>>;
  editorRef: React.MutableRefObject<any>;

  // Toolbar state
  selectedXmlFile: string;
  setSelectedXmlFile: React.Dispatch<React.SetStateAction<string>>;
  selectedXslFile: string;
  setSelectedXslFile: React.Dispatch<React.SetStateAction<string>>;
  autoGenerate: boolean;
  setAutoGenerate: React.Dispatch<React.SetStateAction<boolean>>;

  // PDF state
  workspacePdfUrls: Map<string, string>;
  setWorkspacePdfUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;

  // Logs state
  logs: string;
  setLogs: React.Dispatch<React.SetStateAction<string>>;
  showLogs: boolean;
  setShowLogs: React.Dispatch<React.SetStateAction<boolean>>;

  // Recent workspaces
  recentWorkspaces: string[];
  setRecentWorkspaces: React.Dispatch<React.SetStateAction<string[]>>;

  // Refs for event handlers
  workspacesRef: React.MutableRefObject<Workspace[]>;
  activeWorkspaceIdRef: React.MutableRefObject<string | null>;
  activeWorkspaceRef: React.MutableRefObject<Workspace | undefined>;
  openFilesRef: React.MutableRefObject<OpenFile[]>;
  activeFileIndexRef: React.MutableRefObject<number>;
  autoGenerateRef: React.MutableRefObject<boolean>;
  selectedXmlFileRef: React.MutableRefObject<string>;
  selectedXslFileRef: React.MutableRefObject<string>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showWorkspaceForm, setShowWorkspaceForm] = useState<boolean>(false);

  // UI state
  const [showFileExplorer, setShowFileExplorer] = useState<boolean>(true);
  const [showSearch, setShowSearch] = useState<boolean>(false);

  // Files state
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFiles>({ xml: [], xsl: [] });
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [editorReloadKey, setEditorReloadKey] = useState<number>(0);
  const editorRef = useRef<any>(null);

  // Toolbar state
  const [selectedXmlFile, setSelectedXmlFile] = useState<string>('');
  const [selectedXslFile, setSelectedXslFile] = useState<string>('');
  const [autoGenerate, setAutoGenerate] = useState<boolean>(false);

  // PDF state
  const [workspacePdfUrls, setWorkspacePdfUrls] = useState<Map<string, string>>(new Map());

  // Logs state
  const [logs, setLogs] = useState<string>('');
  const [showLogs, setShowLogs] = useState<boolean>(false);

  // Recent workspaces
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

  // Compute active workspace
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  // Refs for event handlers
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const openFilesRef = useRef(openFiles);
  const activeFileIndexRef = useRef(activeFileIndex);
  const autoGenerateRef = useRef(autoGenerate);
  const selectedXmlFileRef = useRef(selectedXmlFile);
  const selectedXslFileRef = useRef(selectedXslFile);

  const value: WorkspaceContextType = {
    workspaces,
    setWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    showWorkspaceForm,
    setShowWorkspaceForm,
    showFileExplorer,
    setShowFileExplorer,
    showSearch,
    setShowSearch,
    workspaceFiles,
    setWorkspaceFiles,
    openFiles,
    setOpenFiles,
    activeFileIndex,
    setActiveFileIndex,
    editorReloadKey,
    setEditorReloadKey,
    editorRef,
    selectedXmlFile,
    setSelectedXmlFile,
    selectedXslFile,
    setSelectedXslFile,
    autoGenerate,
    setAutoGenerate,
    workspacePdfUrls,
    setWorkspacePdfUrls,
    logs,
    setLogs,
    showLogs,
    setShowLogs,
    recentWorkspaces,
    setRecentWorkspaces,
    workspacesRef,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
    openFilesRef,
    activeFileIndexRef,
    autoGenerateRef,
    selectedXmlFileRef,
    selectedXslFileRef,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};
