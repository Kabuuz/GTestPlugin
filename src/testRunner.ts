/**
 * Run or debug GTest: build if needed, then run executable with filter/env/flags.
 * Reuses CMake Tools settings; passes gtest filter and our config env/flags.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getProject } from './cmakeIntegration';
import { ensureBuilt } from './buildManager';
import { getGtestFilter, getEnv, getGtestFlags, getMiDebuggerPath, getEnvFile } from './config';
import { testStore, TestStatus } from './testStore';
import { GTestTreeNode } from './testTree';
import { appendTestRun } from './gtestOutputChannel';

/** Get executable path for a target from code model (artifacts). */
function getExecutablePath(
  project: { codeModel: unknown },
  targetName: string
): string | undefined {
  const codeModel = project.codeModel as {
    configurations?: Array<{
      projects?: Array<{
        targets?: Array<{
          name: string;
          type: string;
          artifacts?: string[];
        }>;
      }>;
    }>;
  };
  if (!codeModel?.configurations?.[0]?.projects) return undefined;
  for (const proj of codeModel.configurations[0].projects) {
    for (const target of proj.targets || []) {
      if (target.name === targetName && target.artifacts?.length) {
        return target.artifacts[0];
      }
    }
  }
  return undefined;
}

/** Resolve ${workspaceFolder} in a path from launch.json. */
function resolveLaunchPath(
  raw: string,
  workspaceFolder: vscode.WorkspaceFolder
): string {
  return raw.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
}

/** Find a launch.json config that matches the executable (same program path or target name). */
function getMatchingLaunchConfig(
  workspaceFolder: vscode.WorkspaceFolder,
  exePath: string,
  executableName: string
): { miDebuggerPath?: string; envFile?: string } | undefined {
  const launchPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
  try {
    const data = fs.readFileSync(launchPath, 'utf-8');
    const json = JSON.parse(data) as { configurations?: Array<{ type?: string; program?: string; miDebuggerPath?: string; envFile?: string }> };
    const configs = json.configurations;
    if (!Array.isArray(configs)) return undefined;
    const exeNorm = exePath.replace(/\\/g, '/');
    const exeBase = path.basename(exePath);
    for (const c of configs) {
      if (c.type !== 'cppdbg' || !c.program) continue;
      const progResolved = resolveLaunchPath(c.program, workspaceFolder).replace(/\\/g, '/');
      if (progResolved === exeNorm || path.basename(progResolved) === exeBase) {
        return {
          miDebuggerPath: c.miDebuggerPath,
          envFile: c.envFile
        };
      }
    }
  } catch {
    // no launch.json or parse error
  }
  return undefined;
}

/** Build GTest filter from test full names (e.g. Suite1.Test1:Suite2.Test2). */
function buildFilter(fullNames: string[]): string {
  if (fullNames.length === 0) return '*';
  return fullNames.join(':');
}

/** Run executable with args and env; capture stdout/stderr. */
function runProcess(
  executablePath: string,
  args: string[],
  env: Record<string, string>,
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const mergedEnv = { ...process.env, ...env };
    const proc = spawn(executablePath, args, {
      cwd,
      env: mergedEnv,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1
      });
    });
  });
}

/** Parse GTest output to detect passed/failed per test (optional; we can set from exit code for single test). */
function parseGTestOutput(
  stdout: string,
  stderr: string,
  executable: string,
  fullNames: string[]
): Array<{ fullName: string; status: TestStatus }> {
  const output = stdout + '\n' + stderr;
  const results: Array<{ fullName: string; status: TestStatus }> = [];
  const failed = new Set<string>();
  const passed = new Set<string>();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const failMatch = line.match(/\[\s*FAILED\s*\]\s+(\S+)/);
    if (failMatch) failed.add(failMatch[1]);
    const passMatch = line.match(/\[\s*PASSED\s*\]\s+(\S+)/);
    if (passMatch) passed.add(passMatch[1]);
  }
  for (const fullName of fullNames) {
    if (failed.has(fullName)) {
      results.push({ fullName, status: 'failed' });
    } else if (passed.has(fullName)) {
      results.push({ fullName, status: 'passed' });
    } else {
      results.push({ fullName, status: 'none' });
    }
  }
  return results;
}

/**
 * Run tests by executable and list of full test names.
 * Used by both tree (run suite/executable) and code lens (run single test).
 */
export async function runTestsWithNames(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  executable: string,
  fullNames: string[]
): Promise<void> {
  if (fullNames.length === 0) return;
  const project = await getProject(workspaceFolder);
  if (!project) {
    vscode.window.showErrorMessage('CMake project not available.');
    return;
  }
  await ensureBuilt(context, workspaceFolder, [executable]);
  const exePath = getExecutablePath(project, executable);
  if (!exePath) {
    vscode.window.showErrorMessage(`Executable not found for target: ${executable}`);
    return;
  }
  const baseFilter = getGtestFilter();
  const filter = buildFilter(fullNames);
  const finalFilter = baseFilter ? `${filter}${baseFilter.startsWith('-') ? '' : ':' + baseFilter}` : filter;
  const args = [`--gtest_filter=${finalFilter}`, ...getGtestFlags()];
  const env = getEnv();
  const buildDir = await project.getBuildDirectory();
  const cwd = buildDir || path.dirname(exePath);
  for (const fn of fullNames) {
    testStore.setStatus(executable, fn, 'running');
  }
  const result = await runProcess(exePath, args, env, cwd);
  const parsed = parseGTestOutput(
    result.stdout,
    result.stderr,
    executable,
    fullNames
  );
  testStore.setStatusBulk(executable, parsed.map((p) => ({ fullName: p.fullName, status: p.status })));
  const combined = result.stdout + '\n' + result.stderr;
  for (const fn of fullNames) {
    testStore.setOutput(executable, fn, combined);
  }
  appendTestRun(executable, fullNames, combined);
}

/** Run tests from tree node (suite/executable/test). */
export async function runTests(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  node: GTestTreeNode,
  treeProvider: { getTestFullNamesUnder: (n: GTestTreeNode) => string[] }
): Promise<void> {
  const fullNames = treeProvider.getTestFullNamesUnder(node);
  await runTestsWithNames(context, workspaceFolder, node.executable, fullNames);
}

/**
 * Start debugging tests by executable and full test names.
 */
export async function debugTestsWithNames(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  executable: string,
  fullNames: string[]
): Promise<void> {
  if (fullNames.length === 0) return;
  const project = await getProject(workspaceFolder);
  if (!project) {
    vscode.window.showErrorMessage('CMake project not available.');
    return;
  }
  await ensureBuilt(context, workspaceFolder, [executable]);
  const exePath = getExecutablePath(project, executable);
  if (!exePath) {
    vscode.window.showErrorMessage(`Executable not found for target: ${executable}`);
    return;
  }
  const filter = buildFilter(fullNames);
  const args = [`--gtest_filter=${filter}`, ...getGtestFlags()];
  const env = getEnv();
  const envArray = Object.entries(env).map(([k, v]) => ({ name: k, value: v }));
  const cwd = (await project.getBuildDirectory()) || path.dirname(exePath);
  const config: vscode.DebugConfiguration = {
    type: 'cppdbg',
    request: 'launch',
    name: `GTest: ${executable}`,
    program: exePath,
    args,
    cwd,
    environment: envArray
  };
  // Custom GDB path and env file: from our settings first, then from a matching launch.json
  const pluginGdb = getMiDebuggerPath();
  const pluginEnvFile = getEnvFile(workspaceFolder);
  if (pluginGdb) config.miDebuggerPath = pluginGdb;
  if (pluginEnvFile) config.envFile = pluginEnvFile;
  const launchMatch = getMatchingLaunchConfig(workspaceFolder, exePath, executable);
  if (launchMatch) {
    if (!config.miDebuggerPath && launchMatch.miDebuggerPath)
      config.miDebuggerPath = launchMatch.miDebuggerPath;
    if (!config.envFile && launchMatch.envFile)
      config.envFile = resolveLaunchPath(launchMatch.envFile, workspaceFolder);
  }
  await vscode.debug.startDebugging(workspaceFolder, config);
}

/** Start debugging tests from tree node. */
export async function debugTests(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  node: GTestTreeNode,
  treeProvider: { getTestFullNamesUnder: (n: GTestTreeNode) => string[] }
): Promise<void> {
  const fullNames = treeProvider.getTestFullNamesUnder(node);
  await debugTestsWithNames(context, workspaceFolder, node.executable, fullNames);
}
