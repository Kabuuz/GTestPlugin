/**
 * Integration with CMake Tools extension.
 * Gets API and project, maps source files to executable targets.
 */

import * as vscode from 'vscode';
import { getCmakeSourceDirectory } from './config';

// We use dynamic require/import for optional dependency vscode-cmake-tools-api
// so extension loads even if CMake Tools is not installed (we have extensionDependencies so it will be).
type Version = number;
interface CMakeToolsExtensionExports {
  getApi(version: Version): CMakeToolsApi;
}
interface CMakeToolsApi {
  version: number;
  getProject(path: vscode.Uri): Promise<Project | undefined>;
  getActiveFolderPath(): string;
}
export interface Project {
  configure(): Promise<void>;
  build(targets?: string[]): Promise<void>;
  buildWithResult(
    targets?: string[],
    cancellationToken?: vscode.CancellationToken
  ): Promise<CommandResult>;
  getBuildDirectory(): Promise<string | undefined>;
  listBuildTargets(): Promise<string[] | undefined>;
  readonly codeModel: CodeModelContent | undefined;
}
interface CommandResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}
interface CodeModelContent {
  configurations: Array<{
    name: string;
    projects: Array<{
      name: string;
      sourceDirectory: string;
      targets: Array<{
        name: string;
        type: string;
        fullName?: string;
        fileGroups?: Array<{ sources: string[] }>;
      }>;
    }>;
  }>;
}

let cachedApi: CMakeToolsApi | undefined;
let cachedExtension: vscode.Extension<unknown> | undefined;

/**
 * Get CMake Tools API (v1). Returns undefined if extension not installed or not active.
 */
export async function getCMakeApi(): Promise<CMakeToolsApi | undefined> {
  if (cachedApi) {
    return cachedApi;
  }
  const ext = vscode.extensions.getExtension('ms-vscode.cmake-tools');
  if (!ext) {
    return undefined;
  }
  cachedExtension = ext;
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      return undefined;
    }
  }
  const exports = ext.exports as CMakeToolsExtensionExports | undefined;
  if (!exports || typeof exports.getApi !== 'function') {
    return undefined;
  }
  cachedApi = exports.getApi(1) as CMakeToolsApi;
  return cachedApi;
}

/**
 * Get the CMake project for the given workspace folder.
 * If gtest-plugin.cmakeSourceDirectory is set, uses that path as the project root.
 */
export async function getProject(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<Project | undefined> {
  const api = await getCMakeApi();
  if (!api) return undefined;
  const customDir = getCmakeSourceDirectory(workspaceFolder);
  const projectUri = customDir
    ? vscode.Uri.file(customDir)
    : workspaceFolder.uri;
  return api.getProject(projectUri) as Promise<Project | undefined>;
}

/**
 * Map: executable target name -> list of absolute source file paths that belong to that target.
 * Uses CMake code model (fileGroups.sources).
 */
export function getExecutableSources(project: Project): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const codeModel = project.codeModel;
  if (!codeModel || !codeModel.configurations || codeModel.configurations.length === 0) {
    return map;
  }
  const config = codeModel.configurations[0];
  for (const proj of config.projects || []) {
    for (const target of proj.targets || []) {
      if (target.type !== 'EXECUTABLE') continue;
      const name = target.name;
      const sources: string[] = [];
      for (const fg of target.fileGroups || []) {
        for (const s of fg.sources || []) {
          sources.push(s);
        }
      }
      if (sources.length > 0) {
        map.set(name, sources);
      }
    }
  }
  return map;
}

/**
 * Get executable target name that contains the given source file path.
 * Returns first matching executable; if multiple executables use same file, first one is returned.
 */
export function getExecutableForFile(
  project: Project,
  sourceFilePath: string
): string | undefined {
  const map = getExecutableSources(project);
  const normalized = sourceFilePath.replace(/\\/g, '/');
  for (const [execName, sources] of map) {
    for (const s of sources) {
      if (s.replace(/\\/g, '/') === normalized) {
        return execName;
      }
    }
  }
  return undefined;
}
