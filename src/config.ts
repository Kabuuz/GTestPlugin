/**
 * Configuration types and helpers for GTest Plugin.
 * Reads settings from VS Code workspace/user settings (JSON).
 */

import * as vscode from 'vscode';

// Configuration key prefix used in package.json "contributes.configuration"
const CONFIG_SECTION = 'gtest-plugin';

/**
 * Resolves a path that may contain ${workspaceFolder} to absolute path.
 * @param raw - Raw string from settings (e.g. "${workspaceFolder}/tests")
 * @param workspaceFolder - Workspace folder to substitute
 * @returns Resolved absolute path string
 */
export function resolvePath(
  raw: string,
  workspaceFolder: vscode.WorkspaceFolder
): string {
  const replaced = raw.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
  return replaced;
}

/**
 * Get custom CMake project root directory (where CMakeLists.txt is).
 * If set, this is used when getting the CMake project and for build change detection.
 * Empty = use workspace folder.
 */
export function getCmakeSourceDirectory(workspaceFolder: vscode.WorkspaceFolder): string | undefined {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const raw = config.get<string>('cmakeSourceDirectory', '');
  if (!raw || raw.trim() === '') return undefined;
  return resolvePath(raw.trim(), workspaceFolder);
}

/**
 * Get the directory to scan for test sources.
 * Uses gtest-plugin.scanDirectory from settings.
 */
export function getScanDirectory(workspaceFolder: vscode.WorkspaceFolder): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const raw = config.get<string>('scanDirectory', '${workspaceFolder}');
  return resolvePath(raw, workspaceFolder);
}

/**
 * Get glob pattern for files to include when scanning.
 * Uses gtest-plugin.scanIncludePattern from settings.
 */
export function getScanIncludePattern(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>(
    'scanIncludePattern',
    '**/*{test,tests,spec}*.{cpp,hpp}'
  );
}

/**
 * Get number of parallel build jobs (for -j).
 * 0 means use CMake Tools default / build preset.
 */
export function getBuildJobs(): number {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<number>('buildJobs', 0);
}

/**
 * Get default GTest filter string (optional).
 */
export function getGtestFilter(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('gtestFilter', '');
}

/**
 * Get environment variables to set when running tests.
 * Keys = variable names, values = string values.
 */
export function getEnv(): Record<string, string> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const obj = config.get<Record<string, string>>('env', {});
  return obj ?? {};
}

/**
 * Get extra GTest flags (e.g. --gtest_repeat, --gtest_break_on_failure).
 */
export function getGtestFlags(): string[] {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const arr = config.get<string[]>('gtestFlags', []);
  return Array.isArray(arr) ? arr : [];
}

/**
 * Get custom GDB (or MI debugger) path for debugging tests.
 * Used when building the debug launch config; empty = use default or launch.json.
 */
export function getMiDebuggerPath(): string | undefined {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const raw = config.get<string>('miDebuggerPath', '');
  return raw && raw.trim() !== '' ? raw.trim() : undefined;
}

/**
 * Get path to .env file for running/debugging tests.
 * Resolves ${workspaceFolder}; empty = use env from settings or launch.json.
 */
export function getEnvFile(workspaceFolder: vscode.WorkspaceFolder): string | undefined {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const raw = config.get<string>('envFile', '');
  if (!raw || raw.trim() === '') return undefined;
  return resolvePath(raw.trim(), workspaceFolder);
}
