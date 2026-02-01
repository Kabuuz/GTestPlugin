# GTest Plugin for VS Code

Run and debug **Google Test** (GTest) tests inside VS Code with **CMake Tools**. Tests are discovered from your source, shown in a side panel (grouped by executable → suite → test), and can be run or debugged from the tree or from **Run** / **Debug** code lenses next to each test in the editor.

## Requirements

- **VS Code** 1.103 or newer  
- **CMake Tools** (`ms-vscode.cmake-tools`) – required; used for configure, build, and project info  
- **C/C++** (`ms-vscode.cpptools`) – required for **debugging** (uses `cppdbg`)

Your project must use CMake and build test executables (e.g. via `add_executable` and GTest).

## Features

- **Test discovery** – Scans source for `TEST`, `TEST_F`, and `TEST_P` and maps them to CMake executable targets.
- **Side panel** – Tree view: **Executable → Test Suite → Test**, with status icons (not run / passed / failed / ignored).
- **Run / Debug** – From the tree (context menu) or from **Run** / **Debug** code lenses above each test in `.cpp`/`.hpp` (positions update when you edit).
- **Incremental build** – Runs CMake only when `CMakeLists.txt` (or equivalent) changed, and builds only when source files changed (no full rebuild like some other test extensions).
- **Test output** – Per-test logs from the last run in the **Output** panel (bottom, same place as Terminal/Debug Console). Use the **GTest** channel and the panel’s built-in Find (Ctrl+F) to search.
- **Configurable** – Custom CMake directory, scan directory, glob pattern, env vars, GTest flags, default filter, and **custom GDB path and env file** (see below).

## Setup

1. Install **GTest Plugin**, **CMake Tools**, and **C/C++**.
2. Open a CMake workspace (with `CMakeLists.txt`).
3. Configure and select a kit/preset with CMake Tools as usual.
4. Open the **GTest** view in the activity bar (flask icon). Click **Refresh Tests** to discover tests.

Tests appear under each test executable. Use **Run Test** / **Debug Test** from the context menu on a test, suite, or executable, or use the **Run** / **Debug** code lenses in the editor.

## Configuration

All settings live under **GTest Plugin** in VS Code settings (or in `settings.json` under `gtest-plugin`).

| Setting | Description | Default |
|--------|-------------|---------|
| **`gtest-plugin.cmakeSourceDirectory`** | **Custom directory for CMake project root** (where `CMakeLists.txt` is). Use `${workspaceFolder}` for workspace root. Leave empty to use the workspace folder. | `""` |
| `gtest-plugin.scanDirectory` | Directory to scan for test sources. Use `${workspaceFolder}` for the workspace root. | `"${workspaceFolder}"` |
| `gtest-plugin.scanIncludePattern` | Glob for files to scan (relative to `scanDirectory`). | `"**/*{test,tests,spec}*.{cpp,hpp}"` |
| `gtest-plugin.buildJobs` | Parallel build jobs. `0` = use CMake Tools default / build preset. | `0` |
| `gtest-plugin.gtestFilter` | Default GTest filter (e.g. `-*Disabled*`). | `""` |
| `gtest-plugin.env` | Environment variables when running/debugging tests (key-value object). | `{}` |
| `gtest-plugin.gtestFlags` | Extra GTest flags (e.g. `--gtest_repeat=2`). | `[]` |
| **`gtest-plugin.miDebuggerPath`** | **Path to GDB** (or other MI debugger) for debugging tests. Empty = use C/C++ default or a matching `launch.json` config. | `""` |
| **`gtest-plugin.envFile`** | **Path to a .env file** loaded when running/debugging tests. Use `${workspaceFolder}` for workspace root. Empty = use env from settings or from a matching `launch.json` config. | `""` |

## Custom CMake directory

If your CMake project root (where `CMakeLists.txt` lives) is **not** the workspace folder—for example you open the repo root but the CMake project is in a subfolder—set **`gtest-plugin.cmakeSourceDirectory`** to that path.

- The plugin uses this directory when asking CMake Tools for the project (configure, build, code model).
- Incremental build logic (CMakeLists change detection, source mtimes) uses this root as well.
- Use `${workspaceFolder}` in the path, e.g. `${workspaceFolder}/subdir` or `${workspaceFolder}/build-system`.

Example:

```json
{
  "gtest-plugin.cmakeSourceDirectory": "${workspaceFolder}/subdir"
}
```

Leave empty if your workspace folder **is** the CMake project root (default).

## Custom GDB path and environment file

Debugging uses the **C/C++** extension (`cppdbg`). GDB path and env file are chosen in this order:

1. **GTest Plugin settings**  
   - `gtest-plugin.miDebuggerPath` – custom GDB (or MI debugger) path.  
   - `gtest-plugin.envFile` – path to a `.env` file (supports `${workspaceFolder}`).

2. **Matching `launch.json` config**  
   If you don’t set the above (or leave them empty), the extension looks in `.vscode/launch.json` for a **cppdbg** configuration whose `program` matches the test executable (same path or same executable name). From that config it reuses:
   - `miDebuggerPath`
   - `envFile`

So you can:

- Set **GDB and env file only in GTest Plugin**: use `gtest-plugin.miDebuggerPath` and `gtest-plugin.envFile`.
- Set them in **launch.json** for your test executable: the plugin will reuse that config’s `miDebuggerPath` and `envFile` when you debug from the GTest view or code lens.
- Use **CMake Tools** to drive build/configure; your existing launch config (e.g. from CMake Tools or a hand-written one) is used only for **matching** the executable so we can copy GDB path and env file into the dynamic debug session. The actual **program** and **args** (e.g. `--gtest_filter=...`) are always set by the plugin.

Example in **settings.json**:

```json
{
  "gtest-plugin.miDebuggerPath": "/usr/bin/gdb",
  "gtest-plugin.envFile": "${workspaceFolder}/.env.test"
}
```

Example in **launch.json** (plugin will reuse `miDebuggerPath` and `envFile` for a config that matches the test executable):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "cppdbg",
      "request": "launch",
      "name": "Debug my_test_exe",
      "program": "${workspaceFolder}/build/my_test_exe",
      "miDebuggerPath": "/usr/bin/gdb",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

## Usage

- **Rescan tests** – Click the **refresh (reload)** icon in the **Google Tests** view title bar to rescan from the configured directory.
- **Run** – Right-click test/suite/executable → **Run Test**, or click **Run** in the code lens.
- **Debug** – Right-click → **Debug Test**, or click **Debug** in the code lens.
- **View output** – After running tests, logs appear in the **Output** panel (bottom) under the **GTest** channel. Right-click a **test** → **Show test output** to show that test’s last run log in the same panel. Use the Output panel’s Find (Ctrl+F) to search.

## Known limitations

- **Parametrized tests** (`TEST_P`) appear as one node per test name; running it runs all parameter instances. Per-parameter nodes (e.g. `Suite/Test/0`) would require listing tests from the executable (e.g. `--gtest_list_tests`).
- **Build jobs** – The CMake Tools API does not expose `-j`; use a CMake **build preset** with `jobs` if you need parallel builds from the extension.
- **Debug config** – Only `miDebuggerPath` and `envFile` are merged from a matching `launch.json`; other debug options (e.g. `setupCommands`) are not merged. You can still set GDB and env in plugin settings.

## Release notes

### 0.0.1

- Initial release: test discovery, tree view, run/debug from tree and code lens, incremental build, test output panel with search.
- Debug: support for custom GDB path and env file via plugin settings and reuse from matching `launch.json` config.
- **Custom CMake directory**: `gtest-plugin.cmakeSourceDirectory` to point the plugin at a CMake project root that is not the workspace folder.
