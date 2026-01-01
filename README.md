# FOP Live Editor

A desktop application for editing and previewing XSL-FO transformations in real-time. Built with Electron, React, Vite, and Apache FOP.

## Features

- 📝 **Live Editing** - Edit XML and XSL files with syntax highlighting (CodeMirror)
- 👁️ **PDF Preview** - Generate and preview PDF output instantly
- 💾 **Auto-save** - Save with Ctrl+S, optional auto-generate on save
- 📊 **Real-time Logs** - View FOP transformation output and errors
- 🎨 **Modern UI** - Clean, responsive interface with split-panel layout

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

1. **Select Folders:**
   - Click "Browse..." to select your XML folder
   - Click "Browse..." to select your XSL folder

2. **Choose Files:**
   - Select an XML file from the dropdown
   - Select an XSL file from the dropdown

3. **Edit:**
   - Edit files in the CodeMirror editor
   - Switch between XML and XSL tabs
   - Save with the "Save" button or press `Ctrl+S`

4. **Generate PDF:**
   - Click "Generate PDF" to transform XML with XSL
   - View the generated PDF in the right panel
   - Check the output logs at the bottom

5. **Auto-generate:**
   - Enable "Auto-generate on save" to automatically create PDF after each save

## Project Structure

```
fop-live-editor/
├── assets/
│   └── bundled/           # Bundled resources (not in git)
│       ├── jre/           # Java Runtime Environment
│       └── fop/           # Apache FOP binaries
├── examples/              # Sample XML and XSL files
│   ├── xml/
│   │   └── sample.xml
│   └── xsl/
│       └── sample.xsl
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Main process entry point
│   │   └── preload.ts     # Preload script (IPC bridge)
│   └── renderer/          # React renderer process
│       ├── App.tsx        # Main React component
│       ├── App.css        # Styles
│       └── main.tsx       # Renderer entry point
├── dist-electron/         # Compiled Electron code (generated)
├── dist/                  # Compiled React code (generated)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run package` - Package the app for Windows (creates installer)
- `npm run preview` - Preview production build

## Technology Stack

- **Electron** - Desktop application framework
- **React** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type-safe JavaScript
- **CodeMirror 6** - Code editor with XML syntax highlighting
- **Apache FOP** - XSL-FO to PDF transformation
- **Eclipse Temurin JRE** - Java runtime for FOP

## Building for Production

To create a distributable package:

```bash
npm run package
```

This will create an installer in the `release/` folder.

## Notes

- The bundled JRE (~50-80 MB) and FOP (~20-30 MB) are not included in the repository due to size
- Generated PDFs are saved to: `%APPDATA%/fop-live-editor/output.pdf`
- The application is currently configured for Windows x64 only
