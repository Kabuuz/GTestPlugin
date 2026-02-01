/**
 * GTest Plugin for VS Code.
 * Runs and debugs Google Test with CMake Tools; shows tests in side panel with run/debug and code lens.
 */

import * as vscode from 'vscode';
import { GTestTreeProvider } from './testTree';
import { runTests, debugTests, runTestsWithNames, debugTestsWithNames } from './testRunner';
import { GTestCodeLensProvider, CMD_RUN_SINGLE, CMD_DEBUG_SINGLE } from './codeLens';
import { showTestOutputFor } from './gtestOutputChannel';
import { logInfo, logError } from './log';

/** Get the workspace folder we use for CMake (active folder or first). */
function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const f = vscode.workspace.getWorkspaceFolder(active);
    if (f) return f;
  }
  return folders[0];
}

/** Activate the extension: register tree view, commands, code lens, output panel. */
export function activate(context: vscode.ExtensionContext) {
  console.log('GTest Plugin is now active.');

  // Tree provider for the side panel (Executable -> Suite -> Test)
  logInfo('Initializing GTestTreeProvider');
  const treeProvider = new GTestTreeProvider();
  const treeView = vscode.window.createTreeView('GTestList', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  logInfo('Tree view registered');

  // Code lens: Run/Debug at each test line in .cpp/.hpp files
  const codeLensProvider = new GTestCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: 'cpp', scheme: 'file' },
        { language: 'c', scheme: 'file' }
      ],
      codeLensProvider
    )
  );
  logInfo('CodeLens provider registered');

  // When workspace or CMake project changes, refresh tree and code lens
  const refreshAll = async () => {
    logInfo('Refreshing all (tree and codelens)');
    const folder = getWorkspaceFolder();
    if (folder) {
      try {
        await treeProvider.setWorkspace(folder);
        logInfo('Tree provider workspace set');
      } catch (e) {
        logError('Error setting tree provider workspace: ' + (e as Error).message);
      }
      codeLensProvider.refresh();
      logInfo('CodeLens provider refreshed');
    } else {
      logError('No workspace folder found during refreshAll');
    }
  };

  // Initial load: set workspace so tree is populated
  const folder = getWorkspaceFolder();
  if (folder) {
    treeProvider.setWorkspace(folder).then(() => {
      logInfo('Initial workspace set for tree provider');
    }).catch((e) => {
      logError('Error during initial tree provider workspace set: ' + (e as Error).message);
    });
  } else {
    logError('No workspace folder found at activation');
  }

  // Refresh when workspace folder or CMake config might have changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      logInfo('Workspace folders changed');
      refreshAll();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gtest-plugin')) {
        logInfo('gtest-plugin configuration changed, refreshing CodeLens');
        codeLensProvider.refresh();
      }
    })
  );

  // Command: Refresh tests (rescan + rebuild tree)
  context.subscriptions.push(
    vscode.commands.registerCommand('gtest-plugin.refreshTests', () => {
      logInfo('Command: refreshTests invoked');
      refreshAll();
    })
  );

  // Commands that operate on the selected tree item (run/debug test, suite, or executable)
  const runSelected = async () => {
    logInfo('Command: runSelected invoked');
    const folder = getWorkspaceFolder();
    if (!folder) {
      logError('No workspace folder open for runSelected');
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    const sel = treeView.selection[0];
    if (!sel) {
      logInfo('No selection in tree view for runSelected');
      vscode.window.showInformationMessage('Select a test, suite, or executable in the GTest view.');
      return;
    }
    logInfo(`Running tests for selection: ${JSON.stringify(sel)}`);
    await runTests(context, folder, sel, treeProvider);
  };
  const debugSelected = async () => {
    logInfo('Command: debugSelected invoked');
    const folder = getWorkspaceFolder();
    if (!folder) {
      logError('No workspace folder open for debugSelected');
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    const sel = treeView.selection[0];
    if (!sel) {
      logInfo('No selection in tree view for debugSelected');
      vscode.window.showInformationMessage('Select a test, suite, or executable in the GTest view.');
      return;
    }
    logInfo(`Debugging tests for selection: ${JSON.stringify(sel)}`);
    await debugTests(context, folder, sel, treeProvider);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('gtest-plugin.runTest', runSelected),
    vscode.commands.registerCommand('gtest-plugin.debugTest', debugSelected),
    vscode.commands.registerCommand('gtest-plugin.runTestSuite', runSelected),
    vscode.commands.registerCommand('gtest-plugin.debugTestSuite', debugSelected),
    vscode.commands.registerCommand('gtest-plugin.runExecutable', runSelected),
    vscode.commands.registerCommand('gtest-plugin.debugExecutable', debugSelected)
  );
  logInfo('Run/debug commands registered');

  // Command: Show test output (for selected test in tree) — opens Output panel (GTest channel) in bottom panel
  context.subscriptions.push(
    vscode.commands.registerCommand('gtest-plugin.showTestOutput', () => {
      logInfo('Command: showTestOutput invoked');
      const sel = treeView.selection[0];
      if (!sel || !sel.fullName) {
        logInfo('No test selected for showTestOutput');
        vscode.window.showInformationMessage('Select a test in the GTest view to see its output.');
        return;
      }
      logInfo(`Showing test output for: ${sel.executable} ${sel.fullName}`);
      showTestOutputFor(sel.executable, sel.fullName);
    })
  );

  // Commands from code lens: run/debug single test (args: folder, executable, fullName)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CMD_RUN_SINGLE,
      async (
        folder: vscode.WorkspaceFolder,
        executable: string,
        fullName: string
      ) => {
        logInfo(`CodeLens: run single test: ${executable} ${fullName}`);
        await runTestsWithNames(context, folder, executable, [fullName]);
        codeLensProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      CMD_DEBUG_SINGLE,
      async (
        folder: vscode.WorkspaceFolder,
        executable: string,
        fullName: string
      ) => {
        logInfo(`CodeLens: debug single test: ${executable} ${fullName}`);
        await debugTestsWithNames(context, folder, executable, [fullName]);
      }
    )
  );
  logInfo('CodeLens run/debug commands registered');
}

