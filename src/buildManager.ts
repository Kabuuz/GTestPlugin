/**
 * Incremental build: run CMake if CMakeLists.txt changed, build if any .cpp/.hpp changed.
 * Tracks last run state in workspace storage to avoid full rebuild like TestMate.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getProject } from './cmakeIntegration';
import { getCmakeSourceDirectory } from './config';

const STORAGE_KEY_CMAKE_MTIME = 'gtest-plugin.lastCmakeMtime';
const STORAGE_KEY_SOURCE_MTIMES = 'gtest-plugin.lastSourceMtimes';

/** Effective CMake project root: custom dir if set, else workspace folder path. */
function getEffectiveProjectRoot(workspaceFolder: vscode.WorkspaceFolder): string {
  return getCmakeSourceDirectory(workspaceFolder) ?? workspaceFolder.uri.fsPath;
}

/** Get mtime (ms) of a file; 0 if not exists. */
function getMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

/** Find CMakeLists.txt in the CMake project root (custom dir or workspace). */
function findCmakeLists(workspaceFolder: vscode.WorkspaceFolder): string[] {
  const root = getEffectiveProjectRoot(workspaceFolder);
  const out: string[] = [];
  const main = path.join(root, 'CMakeLists.txt');
  if (fs.existsSync(main)) {
    out.push(main);
  }
  return out;
}

/** Check if CMakeLists.txt has changed since last run. */
function cmakeListsChanged(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder
): boolean {
  const lists = findCmakeLists(workspaceFolder);
  if (lists.length === 0) return false;
  const storage = context.globalState;
  const root = getEffectiveProjectRoot(workspaceFolder);
  const key = `${STORAGE_KEY_CMAKE_MTIME}_${root}`;
  const last = storage.get<number>(key, 0);
  const current = Math.max(...lists.map(getMtime));
  return current > last;
}

/** Save current CMakeLists mtimes so next time we know they haven't changed. */
function saveCmakeMtimes(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder
): void {
  const lists = findCmakeLists(workspaceFolder);
  if (lists.length === 0) return;
  const current = Math.max(...lists.map(getMtime));
  const root = getEffectiveProjectRoot(workspaceFolder);
  const key = `${STORAGE_KEY_CMAKE_MTIME}_${root}`;
  context.globalState.update(key, current);
}

/** Get all source paths (.cpp, .hpp) that belong to given executables from code model. */
function getSourcePathsForExecutables(
  project: { codeModel: unknown },
  executableNames: string[]
): string[] {
  const codeModel = project.codeModel as {
    configurations?: Array<{
      projects?: Array<{
        targets?: Array<{
          name: string;
          type: string;
          fileGroups?: Array<{ sources: string[] }>;
        }>;
      }>;
    }>;
  };
  if (!codeModel?.configurations?.[0]?.projects) return [];
  const set = new Set<string>();
  for (const proj of codeModel.configurations[0].projects) {
    for (const target of proj.targets || []) {
      if (target.type !== 'EXECUTABLE' || !executableNames.includes(target.name))
        continue;
      for (const fg of target.fileGroups || []) {
        for (const s of fg.sources || []) {
          const lower = s.toLowerCase();
          if (
            lower.endsWith('.cpp') ||
            lower.endsWith('.hpp') ||
            lower.endsWith('.cxx') ||
            lower.endsWith('.hxx')
          ) {
            set.add(s);
          }
        }
      }
    }
  }
  return Array.from(set);
}

/** Check if any source file for given executables has changed since last run. */
function sourcesChanged(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  project: { codeModel: unknown },
  executableNames: string[]
): boolean {
  const paths = getSourcePathsForExecutables(project, executableNames);
  if (paths.length === 0) return false;
  const storage = context.globalState;
  const root = getEffectiveProjectRoot(workspaceFolder);
  const key = `${STORAGE_KEY_SOURCE_MTIMES}_${root}`;
  const lastMap = (storage.get<Record<string, number>>(key, {})) as Record<
    string,
    number
  >;
  for (const p of paths) {
    const current = getMtime(p);
    const last = lastMap[p] ?? 0;
    if (current > last) return true;
  }
  return false;
}

/** Save current source mtimes for given executables. */
function saveSourceMtimes(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  project: { codeModel: unknown },
  executableNames: string[]
): void {
  const paths = getSourcePathsForExecutables(project, executableNames);
  const root = getEffectiveProjectRoot(workspaceFolder);
  const key = `${STORAGE_KEY_SOURCE_MTIMES}_${root}`;
  const storage = context.globalState;
  const lastMap = (storage.get<Record<string, number>>(key, {})) as Record<
    string,
    number
  >;
  for (const p of paths) {
    lastMap[p] = getMtime(p);
  }
  storage.update(key, lastMap);
}

/**
 * Ensure project is built: configure if CMakeLists changed, build if sources changed.
 * Reuses CMake Tools settings (kit, preset, etc.). Optionally pass -j N via build preset or we'd need to run build command ourselves; CMake Tools API build() doesn't take -j, it uses preset. So we document that user sets jobs in build preset or we skip -j from our config for now. Actually the user asked for -j option - CMake Tools build preset has "jobs" field. So we can suggest they set it in preset. Or we could run cmake --build with -j ourselves after getBuildDirectory() - but that might not use their kit. So we rely on CMake Tools build() and document that buildJobs in our config can be used if we implement custom build command. For now we only do: configure if cmake changed, build(targets) if sources changed. Jobs: we add to package.json and config; when we have a way to pass -j to CMake Tools we can use it (e.g. some API might accept options). Checking: buildWithResult(targets?) - no jobs param. So we leave buildJobs in config for future or for when we run raw cmake --build. For now we just do incremental configure + build.
 */
export async function ensureBuilt(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  executableNames: string[]
): Promise<boolean> {
  const project = await getProject(workspaceFolder);
  if (!project) {
    return false;
  }
  const needConfigure = cmakeListsChanged(context, workspaceFolder);
  if (needConfigure) {
    await project.configure();
    saveCmakeMtimes(context, workspaceFolder);
  }
  const needBuild = sourcesChanged(
    context,
    workspaceFolder,
    project,
    executableNames
  );
  if (needBuild || needConfigure) {
    await project.build(executableNames);
    saveSourceMtimes(context, workspaceFolder, project, executableNames);
  }
  return true;
}
