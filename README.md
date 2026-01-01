# FOP Live Editor

A desktop application for editing and previewing XSL-FO transformations in real-time. Built with Electron, React, Vite, and Apache FOP.

## Features

- � **Workspace System** - Multi-workspace tabs with persistent settings
- 📝 **Monaco Editor** - VS Code editor with XML/XSL syntax highlighting
- 🗂️ **File Explorer** - Hierarchical folder structure with context menu operations
- 👁️ **Live PDF Preview** - Persistent FOP server for fast generation (50-80% faster)
- 🔍 **Full-text Search** - Workspace-wide search with regex support
- ⚡ **Auto-generate** - Optional debounced PDF generation on file save
- 🔄 **Auto-updates** - Built-in update notifications and installation

## Prerequisites

Before running this application, you need to download and set up the bundled resources:

### 1. Java Runtime Environment (JRE)

Download Eclipse Temurin JRE 17+ for Windows x64 from [Adoptium](https://adoptium.net/):
- Choose: **JRE** (not JDK), **Windows x64**, **Version 17 or 21 (LTS)**
- Extract the downloaded archive
- Copy the extracted JRE folder to: `assets/bundled/jre/`
- Verify the structure: `assets/bundled/jre/bin/java.exe` should exist

### 2. Apache FOP

Download Apache FOP 2.11 binary distribution from [Apache FOP Downloads](https://xmlgraphics.apache.org/fop/download.html):
- Download the binary distribution (not source)
- Extract the downloaded archive
- Copy the contents of `fop-2.11/fop/` to: `assets/bundled/fop/`
- Verify the structure:
  - `assets/bundled/fop/build/fop-2.11.jar`
  - `assets/bundled/fop/lib/` (containing dependency JARs)

## Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd fop-live-editor
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up bundled resources** (see Prerequisites above)

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

## Usage

1. **Create/Open Workspace** - Click "New PDF Workspace" or open an existing folder
2. **Edit Files** - Open files from the file explorer, edit with Monaco editor
3. **Select Main Files** - Choose XML and XSL files from toolbar dropdowns
4. **Generate PDF** - Click "Generate PDF" or enable auto-generate on save
5. **File Operations** - Right-click in explorer to create/rename/delete files and folders

## Project Structure

```
fop-live-editor/
├── assets/bundled/        # Bundled JRE + FOP (not in git)
├── examples/              # Sample XML/XSL files (copied to new workspaces)
├── src/
│   ├── main/              # Electron main process + FopServer.java
│   └── renderer/          # React UI with Monaco editor
├── release/               # Built installers (generated)
└── package.json
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run package` - Package the app for Windows (creates installer)
- `npm run preview` - Preview production build

## Technology Stack

- **Electron** + **React** + **Vite** + **TypeScript**
- **Monaco Editor** - VS Code editor component
- **Persistent FOP Server** - Custom Java server for fast PDF generation
- **Eclipse Temurin JRE 21** - Bundled Java runtime

## Building for Production

To create a distributable package:

```bash
npm run package
```

This will create an installer in the `release/` folder.

## Notes

- Bundled JRE and FOP not included in repository (download separately)
- Workspaces store settings in `.fop-editor-workspace.json`
- Windows x64 only, portable ZIP and NSIS installer available
