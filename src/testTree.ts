/**
 * Tree view for GTest: Executable -> Test Suite -> Test.
 * Shows status icons (passed/failed/ignored/none) and supports Run/Debug via context menu.
 */

import * as vscode from 'vscode';
import { ScannedTest, ScannedFile, scanDirectory } from './testScanner';
import { getExecutableSources, getProject, Project } from './cmakeIntegration';
import { testStore, TestStatus } from './testStore';
import { getScanDirectory, getScanIncludePattern } from './config';

/** Scanned test with file path (so we can open at line). */
type ScannedTestWithPath = ScannedTest & { filePath: string };

/** Node types in the tree. */
export type NodeKind = 'executable' | 'suite' | 'test';

/** Base for tree nodes (we use TreeItem with custom contextValue and store payload). */
export interface GTestTreeNode {
  kind: NodeKind;
  /** Label shown in tree. */
  label: string;
  /** For executable: target name. For suite: suite name. For test: fullName. */
  id: string;
  /** Executable target name (for run/debug). */
  executable: string;
  /** Test suite name (suite + test nodes). */
  suiteName?: string;
  /** Full test name e.g. Suite.Test (test nodes). */
  fullName?: string;
  /** Source location (test nodes). */
  filePath?: string;
  line?: number;
  /** Children (for executable and suite). */
  children: GTestTreeNode[];
}

/** Build tree: Executable -> Suite -> Test from scanned files and CMake code model. */
async function buildTree(
  workspaceFolder: vscode.WorkspaceFolder,
  project: Project
): Promise<GTestTreeNode[]> {
  const scanDir = getScanDirectory(workspaceFolder);
  const pattern = getScanIncludePattern();
  const scannedFiles = await scanDirectory(scanDir, pattern);
  const execSources = getExecutableSources(project);
  const fileToExec = new Map<string, string>();
  for (const [exec, sources] of execSources) {
    for (const s of sources) {
      const norm = s.replace(/\\/g, '/');
      fileToExec.set(norm, exec);
    }
  }
  const execToSuites = new Map<string, Map<string, ScannedTestWithPath[]>>();
  for (const file of scannedFiles) {
    const normPath = file.filePath.replace(/\\/g, '/');
    const exec = fileToExec.get(normPath);
    if (!exec) continue;
    let suiteMap = execToSuites.get(exec);
    if (!suiteMap) {
      suiteMap = new Map<string, ScannedTestWithPath[]>();
      execToSuites.set(exec, suiteMap);
    }
    for (const test of file.tests) {
      const list = suiteMap.get(test.suiteName) ?? [];
      list.push({ ...test, filePath: file.filePath });
      suiteMap.set(test.suiteName, list);
    }
  }
  const roots: GTestTreeNode[] = [];
  for (const [exec, suiteMap] of execToSuites) {
    const suiteNodes: GTestTreeNode[] = [];
    for (const [suiteName, tests] of suiteMap) {
      const testNodes: GTestTreeNode[] = tests.map((t) => ({
        kind: 'test' as NodeKind,
        label: t.testName,
        id: `${exec}::${t.fullName}`,
        executable: exec,
        suiteName,
        fullName: t.fullName,
        filePath: t.filePath,
        line: t.line,
        children: []
      }));
      suiteNodes.push({
        kind: 'suite',
        label: suiteName,
        id: `${exec}::${suiteName}`,
        executable: exec,
        suiteName,
        children: testNodes
      });
    }
    roots.push({
      kind: 'executable',
      label: exec,
      id: exec,
      executable: exec,
      children: suiteNodes
    });
  }
  return roots;
}

/** Return codicon name for test status (icon to the left of test name in panel). */
function iconForStatus(status: TestStatus): string {
  switch (status) {
    case 'passed':
      return 'pass'; // check
    case 'failed':
      return 'error'; // x
    case 'ignored':
      return 'circle-slash';
    case 'running':
      return 'sync~spin';
    default:
      return 'circle-outline'; // not run
  }
}

/** Convert our node to VS Code TreeItem. */
function toTreeItem(node: GTestTreeNode): vscode.TreeItem {
  const status =
    node.kind === 'test' && node.fullName
      ? testStore.getStatus(node.executable, node.fullName)
      : 'none';
  const icon = iconForStatus(status);
  const item = new vscode.TreeItem(
    node.label,
    node.children.length > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None
  );
  item.id = node.id;
  item.iconPath = new vscode.ThemeIcon(icon);
  if (node.kind === 'executable') {
    item.contextValue = 'gtest-executable';
  } else if (node.kind === 'suite') {
    item.contextValue = 'gtest-suite';
  } else {
    item.contextValue = 'gtest-test';
  }
  if (node.filePath && node.line !== undefined) {
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        vscode.Uri.file(node.filePath),
        { selection: new vscode.Range(node.line - 1, 0, node.line - 1, 0) }
      ]
    };
  }
  return item;
}

export class GTestTreeProvider
  implements vscode.TreeDataProvider<GTestTreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    GTestTreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private roots: GTestTreeNode[] = [];
  private workspaceFolder: vscode.WorkspaceFolder | undefined;
  private project: Project | undefined;

  constructor() {
    // When test results change, refresh tree so icons update
    testStore.onChanged(() => this._onDidChangeTreeData.fire());
  }

  /** Set workspace and load tree from CMake + scan. */
  async setWorkspace(folder: vscode.WorkspaceFolder): Promise<void> {
    this.workspaceFolder = folder;
    this.project = await getProject(folder);
    this.roots = this.project
      ? await buildTree(folder, this.project)
      : [];
    this._onDidChangeTreeData.fire();
  }

  /** Refresh tree (rescan + rebuild). */
  async refresh(): Promise<void> {
    if (!this.workspaceFolder) return;
    await this.setWorkspace(this.workspaceFolder);
  }

  getChildren(element?: GTestTreeNode): GTestTreeNode[] {
    if (!element) {
      return this.roots;
    }
    return element.children;
  }

  getTreeItem(element: GTestTreeNode): vscode.TreeItem {
    return toTreeItem(element);
  }

  /** Find node by id (for commands that receive treeSelection). */
  findNodeById(id: string): GTestTreeNode | undefined {
    const visit = (nodes: GTestTreeNode[]): GTestTreeNode | undefined => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const child = visit(n.children);
        if (child) return child;
      }
      return undefined;
    };
    return visit(this.roots);
  }

  /** Get all test fullNames under a node (for run suite/executable). */
  getTestFullNamesUnder(node: GTestTreeNode): string[] {
    const out: string[] = [];
    const visit = (n: GTestTreeNode) => {
      if (n.fullName) out.push(n.fullName);
      n.children.forEach(visit);
    };
    visit(node);
    return out;
  }
}
