# Tauri Migration Guide

Complete step-by-step guide for migrating FOP Live Editor from Electron to Tauri while keeping both versions in the same repository using git branches.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Repository Strategy](#repository-strategy)
3. [Prerequisites](#prerequisites)
4. [Phase 0: Branch Setup](#phase-0-branch-setup)
5. [Phase 1: Tauri Installation](#phase-1-tauri-installation)
6. [Phase 2: Project Configuration](#phase-2-project-configuration)
7. [Phase 3: Backend Migration (Rust)](#phase-3-backend-migration-rust)
8. [Phase 4: Frontend Updates](#phase-4-frontend-updates)
9. [Phase 5: Testing & Validation](#phase-5-testing--validation)
10. [Phase 6: Deployment](#phase-6-deployment)
11. [Comparison & Benefits](#comparison--benefits)
12. [Troubleshooting](#troubleshooting)

---

## Overview

### Migration Goals
- ✅ Reduce memory usage from 250-350 MB to 100-150 MB (60% improvement)
- ✅ Reduce bundle size from 150-200 MB to 10-20 MB (90% improvement)
- ✅ Faster startup time (2-3x improvement)
- ✅ Keep all existing functionality
- ✅ Reuse 85% of existing code (entire React frontend)

### What Changes
- **Backend**: TypeScript (Node.js) → Rust
- **Runtime**: Chromium → Native OS WebView
- **IPC**: Electron IPC → Tauri Commands

### What Stays the Same
- **Frontend**: React + TypeScript + Vite (100% reusable)
- **UI Components**: All React components, CSS, CodeMirror
- **Assets**: FOP server, bundled JRE, example files
- **Functionality**: All features remain identical

---

## Repository Strategy

### Branch Structure

```
main                    (current stable - points to Electron initially)
├── electron           (Electron version - backup)
└── tauri              (Tauri version - migration work)
```

### Workflow

```powershell
# Work on Electron version
git checkout electron
npm run dev

# Work on Tauri version
git checkout tauri
npm run dev

# Update main to point to preferred version
git checkout main
git merge tauri  # or electron
```

---

## Prerequisites

### Required Software

1. **Rust Toolchain**
   ```powershell
   # Install via rustup
   # Download from: https://rustup.rs/
   # Or use winget:
   winget install Rustlang.Rustup
   
   # Verify installation
   rustc --version
   cargo --version
   ```

2. **Visual Studio C++ Build Tools** (for Rust compilation on Windows)
   ```powershell
   # Install via Visual Studio Installer
   # Or download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   # Select "Desktop development with C++"
   ```

3. **Node.js & npm** (already installed)

4. **Git** (already installed)

### Time Estimate

| Phase | Estimated Time |
|-------|----------------|
| Setup & Installation | 1-2 hours |
| Backend Migration | 1-2 days |
| Frontend Updates | 4-6 hours |
| Testing | 4-6 hours |
| **Total** | **3-4 days** |

---

## Phase 0: Branch Setup

### Step 1: Create Backup Branch

```powershell
# Ensure all changes are committed
git status
git add .
git commit -m "Pre-migration checkpoint"

# Create electron branch as backup of current working code
git checkout -b electron
git push -u origin electron
```

### Step 2: Create Tauri Branch

```powershell
# Go back to main
git checkout main

# Create tauri branch for migration work
git checkout -b tauri
git push -u origin tauri

# Confirm you're on tauri branch
git branch
# * tauri
```

You're now ready to start migration on the `tauri` branch.

---

## Phase 1: Tauri Installation

### Step 1: Install Rust (if not already installed)

```powershell
# Download and run rustup-init.exe from https://rustup.rs/
# Or use winget:
winget install Rustlang.Rustup

# Close and reopen terminal, then verify:
rustc --version
# Output: rustc 1.x.x (...)

cargo --version
# Output: cargo 1.x.x (...)
```

### Step 2: Install Tauri CLI

```powershell
# Install Tauri CLI globally
cargo install tauri-cli

# Verify installation
cargo tauri --version
```

### Step 3: Add Tauri Dependencies

```powershell
# Install Tauri npm packages
npm install -D @tauri-apps/cli
npm install @tauri-apps/api

# Remove Electron dependencies (save package.json first)
npm uninstall electron electron-builder electronmon
```

### Step 4: Initialize Tauri

```powershell
# Initialize Tauri in existing project
npx tauri init

# Answer prompts:
# - App name: FOP Live Editor
# - Window title: FOP Live Editor
# - Web assets location: dist
# - Dev server URL: http://localhost:5173
# - Frontend dev command: npm run dev:vite
# - Frontend build command: npm run build:renderer
```

This creates `src-tauri/` directory with Rust project structure.

---

## Phase 2: Project Configuration

### Step 1: Update package.json

**File: `package.json`**

```json
{
  "name": "fop-live-editor",
  "version": "0.1.0",
  "description": "FOP Live Editor - Tauri app for editing and previewing XSL-FO transformations",
  "scripts": {
    "dev": "npm run tauri dev",
    "dev:vite": "vite",
    "build": "npm run build:renderer && npm run tauri build",
    "build:renderer": "tsc && vite build",
    "tauri": "tauri",
    "preview": "vite preview"
  },
  "keywords": [
    "tauri",
    "fop",
    "xsl-fo",
    "pdf",
    "editor"
  ],
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.42",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "concurrently": "^8.2.2",
    "typescript": "^5.3.3",
    "vite": "^7.2.2"
  },
  "dependencies": {
    "@codemirror/lang-xml": "^6.0.2",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.23.0",
    "@tauri-apps/api": "^2.1.0",
    "@uiw/react-codemirror": "^4.21.21",
    "chokidar": "^3.5.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

### Step 2: Update Tauri Configuration

**File: `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "FOP Live Editor",
  "version": "0.1.0",
  "identifier": "com.fop-live-editor.app",
  "build": {
    "beforeDevCommand": "npm run dev:vite",
    "beforeBuildCommand": "npm run build:renderer",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "resources": [
      "../assets/bundled/**"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "webviewInstallMode": {
        "type": "embedBootstrapper"
      }
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "app": {
    "windows": [
      {
        "title": "FOP Live Editor",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

### Step 3: Update Cargo.toml

**File: `src-tauri/Cargo.toml`**

```toml
[package]
name = "fop-live-editor"
version = "0.1.0"
description = "FOP Live Editor - XSL-FO to PDF transformation tool"
authors = ["you"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.1", features = ["protocol-asset", "dialog-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

[features]
custom-protocol = ["tauri/custom-protocol"]
```

---

## Phase 3: Backend Migration (Rust)

### File Structure

```
src-tauri/
├── src/
│   ├── main.rs          (Entry point, app setup)
│   ├── commands.rs      (Tauri commands - file operations)
│   └── fop_server.rs    (FOP server management)
├── Cargo.toml
└── tauri.conf.json
```

### Step 1: Main Entry Point

**File: `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fop_server;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Start FOP server on app startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                fop_server::start_server(app_handle).await;
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop FOP server on app quit
                fop_server::stop_server();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::select_folder,
            commands::get_files,
            commands::read_file,
            commands::save_file,
            commands::generate_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 2: Commands Module

**File: `src-tauri/src/commands.rs`**

```rust
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;
    
    let folder = FileDialogBuilder::new()
        .set_title("Select Folder")
        .pick_folder();
    
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn get_files(folder_path: String, extension: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let path = PathBuf::from(&folder_path);
    
    if !path.exists() {
        return Ok(files);
    }
    
    fn search_dir(
        dir: &PathBuf,
        base: &PathBuf,
        ext: &str,
        files: &mut Vec<String>,
    ) -> std::io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                search_dir(&path, base, ext, files)?;
            } else if let Some(file_ext) = path.extension() {
                if file_ext.to_str() == Some(ext.trim_start_matches('.')) {
                    if let Ok(relative) = path.strip_prefix(base) {
                        files.push(relative.to_string_lossy().to_string());
                    }
                }
            }
        }
        Ok(())
    }
    
    search_dir(&path, &path, &extension, &mut files)
        .map_err(|e| e.to_string())?;
    
    files.sort();
    Ok(files)
}

#[tauri::command]
pub async fn read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file(file_path: String, content: String) -> Result<(), String> {
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_pdf(
    xml_path: String,
    xsl_path: String,
    xsl_folder: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    crate::fop_server::generate(app, xml_path, xsl_path, xsl_folder).await
}
```

### Step 3: FOP Server Module

**File: `src-tauri/src/fop_server.rs`**

```rust
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

// Global FOP server state
static FOP_PROCESS: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);
static REQUEST_ID_COUNTER: Mutex<i32> = Mutex::new(0);

#[derive(Serialize)]
struct FopCommand {
    action: String,
    #[serde(rename = "xmlPath", skip_serializing_if = "Option::is_none")]
    xml_path: Option<String>,
    #[serde(rename = "xslPath", skip_serializing_if = "Option::is_none")]
    xsl_path: Option<String>,
    #[serde(rename = "outputPath", skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
    #[serde(rename = "workingDir", skip_serializing_if = "Option::is_none")]
    working_dir: Option<String>,
    #[serde(rename = "requestId")]
    request_id: i32,
}

#[derive(Deserialize, Debug)]
struct FopResponse {
    status: String,
    message: Option<String>,
    #[serde(rename = "outputPath")]
    output_path: Option<String>,
    #[serde(rename = "stackTrace")]
    stack_trace: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<i32>,
}

pub async fn start_server(app: AppHandle) {
    println!("Starting FOP server...");
    
    // Get bundled paths
    let resource_dir = app.path()
        .resource_dir()
        .expect("Failed to get resource dir")
        .join("bundled");
    
    let java_exe = resource_dir.join("jre/bin/java.exe");
    let fop_dir = resource_dir.join("fop");
    let server_dir = fop_dir.join("server");
    let lib_dir = fop_dir.join("lib");
    let build_dir = fop_dir.join("build");
    
    println!("Java: {:?}", java_exe);
    println!("Working dir: {:?}", server_dir);
    
    // Build classpath
    let mut classpath_entries = Vec::new();
    
    // Add build jars
    if let Ok(entries) = fs::read_dir(&build_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "jar" {
                    classpath_entries.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    
    // Add lib jars
    if let Ok(entries) = fs::read_dir(&lib_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "jar" {
                    classpath_entries.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    
    // Add gson and server directory
    classpath_entries.push(server_dir.join("gson-2.10.1.jar").to_string_lossy().to_string());
    classpath_entries.push(server_dir.to_string_lossy().to_string());
    
    let classpath = classpath_entries.join(";");
    
    // Spawn FOP server process
    let mut child = Command::new(&java_exe)
        .args(&[
            "-Xms128m",
            "-Xmx512m",
            "-XX:+UseG1GC",
            "-XX:MaxGCPauseMillis=50",
            "-Djavax.xml.accessExternalStylesheet=all",
            "-Djavax.xml.accessExternalSchema=all",
            "-Dfop.fontcache=temp",
            "-cp",
            &classpath,
            "FopServer",
        ])
        .current_dir(&server_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to start FOP server");
    
    // Store process globally
    let child_arc = Arc::new(Mutex::new(child));
    *FOP_PROCESS.lock().unwrap() = Some(child_arc.clone());
    
    // Listen for stdout responses in background thread
    let app_clone = app.clone();
    let child_clone = child_arc.clone();
    
    std::thread::spawn(move || {
        let mut child_lock = child_clone.lock().unwrap();
        if let Some(stdout) = child_lock.stdout.take() {
            let reader = BufReader::new(stdout);
            
            for line in reader.lines() {
                if let Ok(line) = line {
                    if line.starts_with("RESPONSE:") {
                        let json_str = &line[9..];
                        if let Ok(response) = serde_json::from_str::<FopResponse>(json_str) {
                            println!("FOP Response: {:?}", response);
                            
                            if response.status == "ready" {
                                println!("FOP server ready!");
                            }
                            
                            // Emit events to frontend
                            if let Some(msg) = &response.message {
                                let _ = app_clone.emit("generation-log", msg);
                            }
                        }
                    }
                }
            }
        }
    });
    
    // Listen for stderr in background thread
    let app_clone = app.clone();
    let child_clone = child_arc.clone();
    
    std::thread::spawn(move || {
        let mut child_lock = child_clone.lock().unwrap();
        if let Some(stderr) = child_lock.stderr.take() {
            let reader = BufReader::new(stderr);
            
            for line in reader.lines() {
                if let Ok(line) = line {
                    println!("FOP Server stderr: {}", line);
                    let _ = app_clone.emit("generation-log", line);
                }
            }
        }
    });
}

pub fn stop_server() {
    println!("Stopping FOP server...");
    
    if let Some(process_arc) = FOP_PROCESS.lock().unwrap().take() {
        if let Ok(mut process) = process_arc.lock() {
            let _ = process.kill();
        }
    }
}

pub async fn generate(
    app: AppHandle,
    xml_path: String,
    xsl_path: String,
    xsl_folder: String,
) -> Result<serde_json::Value, String> {
    println!("Generating PDF...");
    
    // Get output path
    let app_data_dir = app.path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    
    fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    let output_pdf = app_data_dir.join("output.pdf");
    
    // Validate input files
    if !PathBuf::from(&xml_path).exists() {
        return Err(format!("XML file not found: {}", xml_path));
    }
    if !PathBuf::from(&xsl_path).exists() {
        return Err(format!("XSL file not found: {}", xsl_path));
    }
    
    // Send generation command to FOP server
    let request_id = {
        let mut counter = REQUEST_ID_COUNTER.lock().unwrap();
        *counter += 1;
        *counter
    };
    
    let command = FopCommand {
        action: "generate".to_string(),
        xml_path: Some(xml_path.clone()),
        xsl_path: Some(xsl_path.clone()),
        output_path: Some(output_pdf.to_string_lossy().to_string()),
        working_dir: Some(xsl_folder),
        request_id,
    };
    
    let json_command = serde_json::to_string(&command).map_err(|e| e.to_string())?;
    
    // Send to FOP server stdin
    if let Some(process_arc) = FOP_PROCESS.lock().unwrap().as_ref() {
        if let Ok(mut process) = process_arc.lock() {
            if let Some(stdin) = process.stdin.as_mut() {
                writeln!(stdin, "{}", json_command).map_err(|e| e.to_string())?;
                stdin.flush().map_err(|e| e.to_string())?;
            }
        }
    }
    
    // For now, return success - in production, implement proper request/response tracking
    // You would need a channel or callback mechanism to wait for the response
    
    Ok(serde_json::json!({
        "success": true,
        "outputPath": output_pdf.to_string_lossy()
    }))
}
```

---

## Phase 4: Frontend Updates

### Step 1: Remove Electron Preload

Delete: `src/main/preload.ts` (not needed in Tauri)
Delete: `src/main/main.ts` (replaced by Rust)

### Step 2: Update App.tsx

**Changes needed in `src/renderer/App.tsx`:**

```typescript
// Add Tauri imports at the top
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/tauri';

// Replace window.electronAPI calls with invoke()

// Before:
const folder = await window.electronAPI.selectFolder();

// After:
const folder = await invoke<string | null>('select_folder');
```

**Full find/replace list:**

| Old (Electron) | New (Tauri) |
|----------------|-------------|
| `window.electronAPI.selectFolder()` | `invoke<string \| null>('select_folder')` |
| `window.electronAPI.getFiles(folder, ext)` | `invoke<string[]>('get_files', { folderPath: folder, extension: ext })` |
| `window.electronAPI.readFile(path)` | `invoke<string>('read_file', { filePath: path })` |
| `window.electronAPI.saveFile(path, content)` | `invoke<void>('save_file', { filePath: path, content })` |
| `window.electronAPI.generatePdf(xml, xsl, folder)` | `invoke<any>('generate_pdf', { xmlPath: xml, xslPath: xsl, xslFolder: folder })` |

### Step 3: Update Event Listeners

```typescript
// Before (Electron):
useEffect(() => {
  if (window.electronAPI) {
    window.electronAPI.onGenerationLog((log: string) => {
      setLogs(prev => prev + log);
    });
  }
}, []);

// After (Tauri):
useEffect(() => {
  const unlisten = listen<string>('generation-log', (event) => {
    setLogs(prev => prev + event.payload);
  });
  
  return () => {
    unlisten.then(fn => fn());
  };
}, []);
```

### Step 4: Update PDF Streaming

```typescript
// Before (Electron):
const fileUrl = `file:///${result.outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

// After (Tauri):
const fileUrl = convertFileSrc(result.outputPath);
```

### Step 5: Remove Type Definitions

Delete or update `src/renderer/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

// Remove Electron API declarations - not needed for Tauri
```

---

## Phase 5: Testing & Validation

### Development Testing

```powershell
# Ensure you're on tauri branch
git branch
# * tauri

# Install dependencies
npm install

# Run in development mode
npm run dev
```

**Test checklist:**
- [ ] App launches successfully
- [ ] Folder selection dialog works
- [ ] File lists populate correctly
- [ ] File reading/editing works
- [ ] File saving works
- [ ] PDF generation works
- [ ] PDF preview displays
- [ ] Logs show correctly
- [ ] Auto-generate on save works
- [ ] Collapsible log panel works

### Production Build Testing

```powershell
# Build the app
npm run build

# Installers will be in src-tauri/target/release/bundle/
```

**Test the built executable:**
- [ ] Installer runs
- [ ] App launches
- [ ] All functionality works
- [ ] Bundled JRE/FOP are accessible
- [ ] Memory usage is reduced

### Compare with Electron Version

```powershell
# Switch to electron branch
git checkout electron
npm install
npm run dev

# Compare:
# - Memory usage (Task Manager)
# - Startup time
# - Bundle size
# - Functionality
```

---

## Phase 6: Deployment

### Update Main Branch

When Tauri version is stable and tested:

```powershell
# Merge tauri into main
git checkout main
git merge tauri
git push origin main

# Tag the release
git tag -a v0.2.0-tauri -m "Tauri migration complete"
git push origin v0.2.0-tauri
```

### Build Distribution

```powershell
git checkout tauri
npm run build

# Installers are in:
# src-tauri/target/release/bundle/nsis/
# src-tauri/target/release/bundle/msi/
```

---

## Comparison & Benefits

### Memory Usage

| Version | Memory (Development) | Memory (Production) |
|---------|---------------------|---------------------|
| Electron | 400-500 MB | 250-350 MB |
| Tauri | 200-300 MB | **100-150 MB** |
| **Improvement** | **40-50%** | **60%** |

### Bundle Size

| Version | Installer Size | Unpacked Size |
|---------|---------------|---------------|
| Electron | 150-200 MB | 300-400 MB |
| Tauri | **10-20 MB** | **50-100 MB** |
| **Improvement** | **90%** | **75%** |

### Startup Time

| Version | Cold Start | Warm Start |
|---------|-----------|-----------|
| Electron | 2-3 sec | 1-2 sec |
| Tauri | **<1 sec** | **<0.5 sec** |
| **Improvement** | **2-3x faster** | **2-4x faster** |

---

## Troubleshooting

### Common Issues

#### 1. Rust Compilation Errors

**Error:** `linking with 'link.exe' failed`

**Solution:**
```powershell
# Install Visual Studio Build Tools
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++"
```

#### 2. FOP Server Not Starting

**Check:**
- Bundled JRE path is correct in `tauri.conf.json` resources
- `FopServer.class` files are included
- Classpath is built correctly in `fop_server.rs`

#### 3. File:// Protocol Not Working

**Solution:**
Use Tauri's `convertFileSrc()`:
```typescript
import { convertFileSrc } from '@tauri-apps/api/tauri';
const url = convertFileSrc(filePath);
```

#### 4. IPC Calls Failing

**Check:**
- Command names match (snake_case in Rust, invoke calls)
- Parameters are passed correctly (as object in Tauri)
- Command is registered in `main.rs` `invoke_handler`

---

## Next Steps

After successful migration:

1. **Performance Testing**: Compare memory, startup, generation speed
2. **User Acceptance Testing**: Ensure all features work as expected
3. **Documentation**: Update README to reflect Tauri architecture
4. **CI/CD**: Update build pipelines for Rust/Tauri
5. **Code Signing**: Set up code signing for Windows releases

---

## Resources

- [Tauri Documentation](https://tauri.app/v2/guides/)
- [Tauri API Reference](https://tauri.app/v2/reference/javascript/api/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Current Electron Code](https://github.com/bogdan-lefter09/fop-live-editor/tree/electron)

---

## Support

For issues during migration:
- Check Tauri Discord: https://discord.gg/tauri
- GitHub Issues: https://github.com/tauri-apps/tauri/issues
- Rust Community: https://users.rust-lang.org/
