/**
 * Code lens: Run and Debug buttons near the line number for each test.
 * Scans the current file dynamically so when you add/remove lines, positions stay correct.
 */

import * as vscode from 'vscode';
import { scanDocument } from './testScanner';
import { getProject, getExecutableForFile } from './cmakeIntegration';

/** Command IDs we register (run single test, debug single test). */
export const CMD_RUN_SINGLE = 'gtest-plugin.runSingleTest';
export const CMD_DEBUG_SINGLE = 'gtest-plugin.debugSingleTest';

/**
 * Provides code lenses at each line that has a GTest (TEST/TEST_F/TEST_P).
 * Each test gets two lenses: "Run" and "Debug".
 */
export class GTestCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLens = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLens = this._onDidChangeCodeLens.event;

  constructor() {}

  /** Call when tests or project change so lenses refresh. */
  refresh(): void {
    this._onDidChangeCodeLens.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return lenses;
    const project = await getProject(folder);
    if (!project) return lenses;
    const filePath = document.uri.fsPath;
    const executable = getExecutableForFile(project, filePath);
    if (!executable) return lenses;
    const tests = scanDocument(document);
    for (const test of tests) {
      const line = test.line - 1;
      const range = new vscode.Range(line, 0, line, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(play) Run',
          command: CMD_RUN_SINGLE,
          arguments: [folder, executable, test.fullName]
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(debug-start) Debug',
          command: CMD_DEBUG_SINGLE,
          arguments: [folder, executable, test.fullName]
        })
      );
    }
    return lenses;
  }
}
