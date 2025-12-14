Great — thanks for the clear constraints. Below is a focused, actionable step-by-step implementation plan for an Electron desktop app targeting Windows only, bundling a JRE and FOP, using React + Vite for the renderer and CodeMirror (v6) for syntax highlighting. I’ve avoided source code files per your earlier request and kept this as a plan with exact commands, paths, and concrete tasks you can follow.

High-level architecture (one sentence)

Electron app with a React+Vite renderer (UI) and an Electron main process that manages a persistent FOP server; editor is Monaco (VS Code editor); multi-workspace tab system with file explorer; PDF preview streams via file:// protocol; workspace settings persisted in `.fop-editor-workspace.json`; watch-save -> debounced request to persistent server -> render PDF.

## ✅ Completed Optimizations & Features

### Performance Improvements
- **Persistent FOP Server**: Java server process keeps FOP loaded in memory (50-80% faster PDF generation)
- **Streaming PDFs**: PDFs streamed via file:// protocol instead of loading into memory (saves 10-30 MB per PDF)
- **Memory Optimization**: Reduced Java heap from 256MB-1GB to 128MB-512MB with G1GC
- **Package Options**: Added ZIP portable version alongside NSIS installer

### Architecture Changes
- **FopServer.java**: Persistent Java server that processes JSON commands via stdin/stdout
- **IPC Protocol**: JSON-based request/response system for PDF generation
- **Server Lifecycle Management**: FOP server starts on app launch, graceful shutdown on quit
- **Cache Busting**: Timestamp-based PDF reload to prevent browser caching issues

### UI/UX Improvements
- **Collapsible Log Panel**: Hide/show output console to maximize screen space
- **Error Handling**: Clear error messages when PDF generation fails
- **Background Throttling**: Reduced memory usage when app is minimized
- **Workspace System**: Multi-workspace tab support with `.fop-editor-workspace.json` configuration
- **VS Code-style Interface**: Vertical icon bar with file explorer and search functionality
- **Monaco Editor Integration**: VS Code editor component for XML/XSL editing

Phases & step-by-step tasks

Phase 0 — Prep & downloads (before coding)

Platform: target Windows x64 (single-platform simplifies packaging).
Choose JRE distribution (Windows redistributable): pick an OpenJDK build (e.g., Eclipse Temurin / Adoptium) for Windows x64. Download the JRE zip or installer and extract the JRE folder you'll bundle.
Download an Apache FOP Windows distribution (zip). From the distribution take fop.jar and supporting libs. Using java -jar fop.jar is recommended over wrapper scripts.
Create a project plan/repo for the app.
Phase 1 — Project scaffolding (React + Vite + Electron)

Create repo and initialize npm:
npm init -y
Create a Vite + React app (recommended template):
npx create-vite@latest my-app --template react
Add Electron: install as dev dependency (latest stable).
Development setup: plan to run Vite dev server and Electron in parallel. Tools/plugins you can use:
electron-builder for packaging
electronmon / concurrently or a small script to spawn electron while Vite serves
Optionally use community tools like electron-vite if you want automation.
Install core npm dependencies:
runtime: electron (dev), pdfjs-dist, @monaco-editor/react, chokidar, electron-store (or write simple JSON), cross-spawn (optional).
dev: electron-builder, concurrently (optional).
Project directory layout suggestion:
src/
main/ (Electron main process code: spawn FOP, watchers, IPC handlers, workspace management)
renderer/ (React + Vite app, Monaco editor component, PDF viewer, workspace UI)
assets/bundled/
jre/ (bundled Windows JRE folder)
fop/ (bundled FOP distribution: fop.jar + lib)
examples/ (sample XML and XSL files for dev mode)
xml/ (sample XML files)
xsl/ (sample XSL files)
user-data/ or use Electron app.getPath('userData') for workspace settings/output at runtime
Phase 2 — Main responsibilities & IPC

Main process responsibilities:
Manage global settings (paths to bundled resources vs user-specified).
Create and manage workspaces (create folders, `.fop-editor-workspace.json` files).
Start/stop file watchers (chokidar) per workspace for XML & XSL directories.
Receive "generate" requests from renderer via IPC for specific workspaces.
Spawn the bundled JRE to run FOP, capture stdout/stderr, manage process lifecycle (kill previous job if new request comes).
Read generated PDF file and send binary to renderer (via IPC or serve from temp path).
Recursively scan XML/ and XSL/ folders to populate toolbar comboboxes.
Renderer responsibilities:
Workspace tab management (create, switch, close workspaces).
Initial "New PDF Workspace" button state when no workspaces are open.
Workspace creation form (folder selection, workspace name input, create button).
Vertical icon bar (file explorer toggle, search).
File explorer panel showing workspace folder tree.
Toolbar with XML/XSL file comboboxes and auto-generate toggle.
Monaco editor for editing selected file(s) with multi-file tab support within each workspace.
PDF preview area (PDF.js).
Errors/Logs panel that displays FOP stderr/stdout text.
IPC channels to define (examples):
renderer -> main: create-workspace, open-workspace, close-workspace, browse-folder, scan-workspace-files, read-file, save-file, generate-pdf, delete-file, rename-file
main -> renderer: workspace-created, workspace-opened, files-scanned, generation-started, generation-progress (stdout/stderr), generation-finished (with PDF binary or path), error
Phase 3 — Workspace & UI Architecture

## Initial State (No Workspaces Open)
UI shows:
- Left side: Single button "New PDF Workspace"
- Empty workspace area
- Menu bar: File -> "New PDF Workspace" option

## Workspace Creation Flow
When "New PDF Workspace" is clicked:
1. Form appears with:
   - Folder location (text input + Browse button) - where workspace will be created
   - Workspace name input (used for both folder name and default PDF output name)
   - "Create PDF Workspace" button
2. On create:
   - Main process creates folder: `{selectedFolder}\{workspaceName}\`
   - Creates `.fop-editor-workspace.json` with: `{"workspaceName": "..."}`
   - Creates subfolders: `{workspaceName}\xml\` and `{workspaceName}\xsl\`
   - If dev mode: copies files from `examples/xml/` -> workspace `xml/`, `examples/xsl/` -> workspace `xsl/`
   - Opens workspace in new tab

## Workspace Tab System
- Top-level tabs: Each tab represents one workspace
- Prevent duplicate: Cannot open same workspace twice in same session
- Close behavior: When all workspace tabs closed, return to "New PDF Workspace" button state
- File menu integration: File -> "New PDF Workspace" creates new workspace tab

## Active Workspace UI Layout (Multi-Level Tabs)
Structure: Workspace Tab (outer) contains File Tabs (inner) for opened files

**Vertical Icon Bar (leftmost, ~48px wide):**
- File Explorer icon button (toggles file explorer panel)
- Search icon button (toggles search panel)

**File Explorer Panel (left side, toggleable, ~250-300px):**
- Shows workspace folder tree
- Displays XML/ and XSL/ subfolders with files
- Click file -> opens in editor (creates inner file tab)
- Recursive folder display

**Toolbar (below menu bar, spans horizontally):**
- "XML file:" label + combobox (populated with recursive scan of XML/ folder)
- "XSL file:" label + combobox (populated with recursive scan of XSL/ folder)
- Auto-generate toggle checkbox
- Generate PDF button

**Editor Area (center-left, horizontal split with PDF viewer):**
- Inner file tabs: Each opened file from file explorer gets its own tab within the workspace
- Monaco editor (@monaco-editor/react) for XML/XSL editing
- Ctrl+S saves current file
- Dirty indicator (dot) on unsaved file tabs

**PDF Preview (right side, 50% width):**
- PDF.js viewer
- Basic controls (page up/down, zoom)
- Shows output named: `{workspaceName}.pdf`

**Bottom Panel (collapsible):**
- Errors/Logs console (FOP stdout/stderr)

## Behavior
1. User creates workspace -> toolbar comboboxes populated with files from XML/ and XSL/ folders
2. User clicks file in explorer -> file opens in editor (inner file tab created)
3. User selects main XML from toolbar combobox -> sets XML file for PDF generation
4. User selects main XSL from toolbar combobox -> sets XSL file for PDF generation (XSL folder becomes cwd for FOP)
5. Auto-generate enabled: Save triggers debounced PDF generation
6. Generate button: Manual PDF generation with selected XML/XSL
7. Output PDF: Named `{workspaceName}.pdf` by default

## UI Implementation Order (by Difficulty & Dependencies)

### Phase 1: Foundation (Easiest)
1. **Basic workspace tab system shell** - Create top-level tabs component that can hold multiple workspaces (no functionality yet, just the UI container)
2. **Initial "New PDF Workspace" button state** - Display button when no workspaces are open
3. **Workspace creation form** - Build the form with folder browse, name input, and create button
4. **Menu bar integration** - Add File → "New PDF Workspace" menu item

### Phase 2: Core Workspace (Easy-Medium)
5. **Workspace folder creation (IPC)** - Main process handlers to create workspace folder structure (folder + XML/ + XSL/ + .fop-editor-workspace.json)
6. **Dev mode file copying** - Copy example files from `examples/` to new workspace in dev mode
7. **Workspace tab open/close** - Open workspace in new tab after creation, close tab functionality
8. **Prevent duplicate workspaces** - Track open workspaces and prevent opening same workspace twice

### Phase 3: File System UI (Medium)
9. **Vertical icon bar** - Create ~48px left bar with file explorer and search icons (buttons only, no functionality)
10. **File explorer panel toggle** - Show/hide file explorer panel when icon clicked
11. **Basic file tree component** - Display workspace folder structure (use library like `react-arborist` or build simple recursive tree)
12. **Recursive file scanning (IPC)** - Main process handlers to scan XML/ and XSL/ folders recursively
13. **Toolbar with comboboxes** - Create toolbar below menu bar with XML/XSL file dropdowns

### Phase 4: Editor Integration (Medium-Hard)
14. **Monaco editor integration** - Add `@monaco-editor/react` component to editor area
15. **File opening from explorer** - Click file in tree → load content → display in Monaco editor
16. **Inner file tabs system** - Create tabs within workspace for opened files
17. **File content loading (IPC)** - Read file from disk and load into editor
18. **Dirty indicators** - Show dot on tab when file has unsaved changes
19. **File save (Ctrl+S)** - Save current file content back to disk

### Phase 5: PDF Generation (Medium-Hard)
20. **Toolbar main file selection** - Connect comboboxes to workspace settings (selectedXmlFile, selectedXslFile)
21. **Auto-generate toggle** - Checkbox in toolbar that persists to workspace settings
22. **Generate PDF button** - Manual trigger for PDF generation
23. **PDF generation with workspace context** - Use selected XML/XSL from toolbar comboboxes
24. **PDF viewer integration** - Display generated `{workspaceName}.pdf` in right panel

### Phase 6: Advanced Features (Hard)
25. **Workspace settings persistence** - Save/load .fop-editor-workspace.json (selected files, open files, auto-generate state)
26. **Multi-workspace state management** - Each workspace tab maintains independent state (selected files, open editor tabs, etc.)
27. **Restore workspaces on startup** - Load lastOpenedWorkspaces from global settings
28. **File watcher per workspace** - Debounced auto-generate when files change and auto-generate is enabled
29. **Search panel** - Implement search functionality (initially can be placeholder)
30. **Recent workspaces list** - Settings screen with clickable recent workspace list

### Critical Path (Minimum Viable Implementation)
For rapid prototyping, follow this subset: **1 → 2 → 3 → 5 → 6 → 7 → 14 → 15 → 17 → 19 → 20 → 22 → 24**

This gives you: workspace creation → Monaco editor → file editing → PDF generation.

**Implementation Strategy:** Start with Phase 1-2 (foundational structure), then implement Phase 4 (editor) before Phase 3 (file tree), because you can hardcode file paths for testing initially. File tree is more UI work but less critical for core functionality.

Phase 4 — FOP invocation (Windows specifics)

Recommended invocation (use bundled JRE java binary; avoids platform script behavior):
{APP_RESOURCES}\bundled\jre\bin\java.exe -jar {APP_RESOURCES}\bundled\fop\fop.jar -xml "C:\path\to\input.xml" -xsl "C:\path\to\styles\main.xsl" -pdf "C:\path\to\output.pdf"
Important: spawn with working directory = XSL folder (cwd option). That ensures xsl:include/xsl:import relative URIs resolve without manual URI rewriting.
Make sure to properly quote/escape paths with spaces; when using child_process.spawn pass each argument in the args array rather than building a single command string.
Capture stdout and stderr to show in the Errors panel. Use exit code to determine success.
Phase 5 — Watch, debounce, and process lifecycle

Watching:
Use chokidar to watch:
the selected XML file
the selected XSL file(s) and the entire XSL folder (watch *.xsl, *.xslt)
When file change detected, notify main which schedules a regeneration.
Debounce:
Use a debounce interval (recommended 400–800 ms). Typical: 500ms.
Cancel any existing debounce timer on new event; if process already running, kill it before starting new generation.
Output PDF placement:
Save generated PDF to a predictable path, e.g. app.getPath('userData')\last-output.pdf or output-{timestamp}.pdf.
After generation complete, read the PDF file in main process and send a binary buffer via IPC to renderer. Renderer creates a Blob URL and loads into PDF.js (prevents file:// CORS issues).
Phase 6 — PDF preview (PDF.js)

Use pdfjs-dist in renderer to render the PDF Blob received via IPC.
Provide pagination and zoom controls, basic toolbar.
Re-render when new PDF buffer arrives.
Phase 7 — Settings & Workspace Configuration

## Global Settings (persisted in app.getPath('userData') settings.json):
```json
{
  "useBundledJRE": true,
  "bundledJREPath": "resources/bundled/jre",
  "bundledFopPath": "resources/bundled/fop/fop.jar",
  "customJREPath": null,
  "customFopPath": null,
  "recentWorkspaces": ["C:\\path\\to\\workspace1", "C:\\path\\to\\workspace2"],
  "lastOpenedWorkspaces": ["C:\\path\\to\\workspace1"]
}
```

## Workspace Settings (per workspace, `.fop-editor-workspace.json`):
Located at: `{workspaceFolder}\.fop-editor-workspace.json`
```json
{
  "workspaceName": "MyInvoicePDF",
  "selectedXmlFile": "xml/invoice.xml",
  "selectedXslFile": "xsl/invoice.xsl",
  "autoGenerate": true,
  "openFiles": ["xml/invoice.xml", "xsl/invoice.xsl", "xsl/common-layout.xsl"]
}
```

## UI Settings Screen:
- Toggle to use bundled or custom JRE/FOP
- Browse buttons to choose custom JRE home or FOP folder
- Validate by running `java -version` or `java -jar fop.jar --version`
- Recent workspaces list (click to reopen)
- On startup: if bundled JRE/FOP exist, use them by default; restore last opened workspaces

Phase 7a — Open Existing Folder as Workspace

**Feature:** Allow users to open an existing folder as a workspace, even if it wasn't created through the app's "New PDF Workspace" flow.

**Behavior:**
1. Add "Open Folder as Workspace" option in File menu and/or main button area
2. User browses and selects an existing folder
3. Main process scans the selected folder:
   - Look for `xml/` subfolder
   - Look for `xsl/` subfolder
   - Look for `.fop-editor-workspace.json` file
   - Ignore all other files and folders
4. Folder structure setup:
   - If `xml/` folder missing -> create it
   - If `xsl/` folder missing -> create it
   - Result: Every opened workspace will have both xml/ and xsl/ folders
5. Workspace file handling:
   - If `.fop-editor-workspace.json` exists -> load settings from it
   - If missing -> create new workspace file with default values:
     ```json
     {
       "workspaceName": "{folder name}",
       "selectedXmlFile": null,
       "selectedXslFile": null,
       "autoGenerate": false,
       "openFiles": []
     }
     ```
6. Open the folder as a workspace tab with loaded/generated settings
7. Add folder path to recent workspaces list

**Implementation:**
- Add IPC handler: `open-folder-as-workspace`
- Validate folder structure (check for xml/ and xsl/ existence)
- Read or create `.fop-editor-workspace.json`
- Reuse existing workspace opening logic to display in UI
- Update recent workspaces in global settings

**Use Cases:**
- Opening workspaces created manually outside the app
- Opening workspaces from other machines or shared drives
- Opening legacy project folders that follow the xml/xsl structure

Phase 8 — Dev workflow

Development commands:
Start Vite dev server (port e.g. 5173)
Start Electron (pointed to localhost:5173)
Use nodemon or a watch script for the main process (restart on changes)
Hot reload:
Renderer will reload via Vite HMR
Main process restarts on code changes (need a dev helper)
Phase 9 — Packaging for Windows (electron-builder)

Use electron-builder to create Windows installer (NSIS or Squirrel).
Bundling strategy:
Put the bundled JRE and FOP distribution into electron-builder extraResources so they are unpacked beside the executable (not inside asar).
Example resource layout inside packaged app (approx):
<app>\resources\app\ (app files)
<app>\resources\bundled\jre\bin\java.exe
<app>\resources\bundled\fop\fop.jar
electron-builder config:
Configure nsis target for Windows x64
Use files/extraResources to include assets/bundled/* and ensure they're accessible at runtime
Permissions:
On Windows, executable permission not an issue, but ensure paths exist and java.exe is executable.
App size:
Bundling JRE will increase installer size significantly (~50–100+ MB).
Testing installer:
Build and install on a clean Windows VM to verify bundled Java and FOP are found and run correctly.
Phase 10 — Auto-update functionality

Use electron-updater (built into electron-builder) to provide automatic updates.
Configure electron-builder to publish releases:
Set publish configuration in electron-builder config (e.g., GitHub releases, S3, or custom server)
Generate latest.yml manifest file during build (electron-builder does this automatically)
Main process auto-update logic:
Import autoUpdater from electron-updater
Check for updates on app startup
Listen for update events: update-available, update-downloaded, error
Notify renderer when update is available or downloaded
Provide IPC handlers for: check-for-updates, download-update, quit-and-install
User interaction:
Show notification in UI when update is available (e.g., banner or dialog)
Provide "Download Update" and "Install and Restart" buttons
Option to skip version or remind later
Auto-download updates in background (configurable)
Testing:
Test update flow by creating a new release with higher version number
Verify update download, installation, and version upgrade
Test rollback scenario if update fails
Security:
Code-sign the application (required for Windows auto-updates to work smoothly)
Verify update signatures to prevent tampering
Use HTTPS for update server

Phase 11 — Testing & QA (manual testing only)

Manual testing checklist:
- Create new workspace -> verify folder structure (XML/, XSL/, .fop-editor-workspace.json)
- Dev mode: verify example files copied to workspace
- Open multiple workspaces -> verify each workspace tab is independent
- Prevent duplicate workspace opening -> try opening same workspace twice
- Close all workspace tabs -> verify "New PDF Workspace" button returns
- File explorer: click files -> verify they open in editor with inner tabs
- Toolbar comboboxes: verify recursive file scanning from XML/ and XSL/ folders
- Select main XML/XSL from toolbar -> edit files -> Save -> PDF generated -> Preview updated
- Multi-file editing: open multiple files -> switch between inner tabs -> verify content preserved
- XSL with xsl:include uses relative includes and works
- Long path names and spaces work (paths properly quoted)
- Kill and restart generation while a generation is in progress -> no orphan processes remain
- Edge cases: Large output PDFs render and do not block UI
- Windows-specific checks: App runs on Windows 10/11, installer works
- Workspace persistence: close and reopen app -> verify last workspaces restored
Note: Formal automated testing not implemented - manual testing used for validation.
MVP (minimum you should implement for v2 with workspace system)

1. Electron app shell + React + Vite setup
2. Initial state: "New PDF Workspace" button
3. Workspace creation form (folder browse, name input, create button)
4. Workspace folder creation with XML/ and XSL/ subfolders + `.fop-editor-workspace.json`
5. Dev mode: copy example files from `examples/` to new workspace
6. Workspace tab system (open, switch, close, prevent duplicates)
7. Vertical icon bar (file explorer toggle, search placeholder)
8. File explorer panel showing workspace folder tree
9. Toolbar with XML/XSL comboboxes (recursive file scanning) + auto-generate toggle
10. Monaco editor (@monaco-editor/react) for XML/XSL editing
11. Inner file tabs (multi-file editing within workspace)
12. Main process spawn logic to run bundled java -jar fop.jar with cwd set to XSL folder
13. Debounced watcher (chokidar) that triggers generation on Save when auto-generate enabled
14. PDF preview using pdfjs-dist, output named `{workspaceName}.pdf`
15. Settings persistence (global + per-workspace)
16. Recent workspaces list and restore on startup (optional for MVP)
17. Packaging setup with electron-builder including extraResources to bundle jre and fop
Concrete runtime command example (for your spawn call)

Example args array (pseudocode, not source file):
javaPath = "C:\path\to\bundled\jre\bin\java.exe"
args = ["-jar", "C:\path\to\bundled\fop\fop.jar", "-xml", "C:\project\data\input.xml", "-xsl", "C:\project\styles\main.xsl", "-pdf", "C:\Users\<user>\AppData\Local\MyApp\last-output.pdf"]
spawn(javaPath, args, { cwd: "C:\project\styles" })
Important gotchas & tips

Use the working directory (cwd) set to the XSL folder so relative xsl:include/imports and resource references (images, etc.) resolve correctly.
Always pass args as an array to spawn to handle spaces in paths.
Kill previous child process before spawning a new one to avoid concurrent FOP jobs.
Send the generated PDF as a binary buffer via IPC to the renderer to avoid file:// CORS problems when loading in PDF.js.
Keep bundled resources outside asar or use asarUnpack/extraResources so java.exe and fop.jar are executable.
On Windows, anti-virus / Windows Defender can flag bundled executables — test on clean machines and consider documenting install steps for users.

## Known Issues

### Monaco Editor Find Widget Button Alignment
**Issue:** When pressing Ctrl+F in the Monaco editor, the find bar appears but the toggle buttons (case sensitive, whole word, regex) are misaligned vertically. The buttons appear slightly below the find input box instead of being properly centered with it.

**Status:** Unresolved - CSS fixes attempted but did not solve the alignment issue.

**Workaround:** None currently - the find functionality still works, but the visual alignment is incorrect.

**Next Steps:** This may require investigating Monaco Editor's internal CSS structure or potentially filing an issue with the `@monaco-editor/react` package to understand the proper way to override the default styling.