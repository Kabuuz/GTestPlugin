/**
 * Scans source files for GTest macros: TEST, TEST_F, TEST_P.
 * Extracts test suite name, test name, and line number for each test.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';

/** Kind of GTest macro: TEST (no fixture), TEST_F (fixture), TEST_P (parameterized). */
export type TestKind = 'TEST' | 'TEST_F' | 'TEST_P';

/** Single test definition found in a source file. */
export interface ScannedTest {
  /** Test suite name (first argument of macro). */
  suiteName: string;
  /** Test name (second argument of macro). */
  testName: string;
  /** Line number (1-based) where the macro starts. */
  line: number;
  /** Which macro was used. */
  kind: TestKind;
  /** Full test id as GTest reports: SuiteName.TestName (or SuiteName/TestName/0 for param). */
  fullName: string;
}

/** Result of scanning one file: file path and list of tests. */
export interface ScannedFile {
  /** Absolute path to the file. */
  filePath: string;
  /** Tests found in this file. */
  tests: ScannedTest[];
}

// Regex for TEST(Suite, Test) - suite and test are C++ identifiers (letters, digits, underscore)
// Captures: (1)=Suite, (2)=Test. Handles possible line continuation and spaces.
const TEST_REGEX = /^\s*TEST\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/gm;
const TEST_F_REGEX = /^\s*TEST_F\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/gm;
const TEST_P_REGEX = /^\s*TEST_P\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/gm;

/**
 * Find all matches of a regex in text and return line numbers.
 * VS Code uses 1-based line numbers.
 */
function findMatches(
  text: string,
  regex: RegExp,
  kind: TestKind
): Array<{ suiteName: string; testName: string; line: number }> {
  const results: Array<{ suiteName: string; testName: string; line: number }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    regex.lastIndex = 0;
    const m = regex.exec(line);
    if (m) {
      results.push({
        suiteName: m[1],
        testName: m[2],
        line: i + 1
      });
    }
  }
  return results;
}

/**
 * Scan one file for GTest macros and return list of tests.
 * @param filePath - Absolute path to .cpp or .hpp file
 * @returns List of scanned tests, or empty array on error
 */
export function scanFile(filePath: string): ScannedTest[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const tests: ScannedTest[] = [];
  const run = (regex: RegExp, kind: TestKind) => {
    const matches = findMatches(content, regex, kind);
    for (const m of matches) {
      const fullName = `${m.suiteName}.${m.testName}`;
      tests.push({
        suiteName: m.suiteName,
        testName: m.testName,
        line: m.line,
        kind,
        fullName
      });
    }
  };
  run(TEST_REGEX, 'TEST');
  run(TEST_F_REGEX, 'TEST_F');
  run(TEST_P_REGEX, 'TEST_P');
  return tests;
}

/**
 * Scan multiple files (by glob) under a root directory.
 * @param scanDir - Root directory to resolve glob from
 * @param includePattern - Glob pattern for test source files
 * @returns List of scanned files with their tests
 */
export async function scanDirectory(
  scanDir: string,
  includePattern: string
): Promise<ScannedFile[]> {
  const pattern = new vscode.RelativePattern(scanDir, includePattern);
  const files = await vscode.workspace.findFiles(pattern, null, 10000);
  const results: ScannedFile[] = [];
  for (const u of files) {
    const filePath = u.fsPath;
    const tests = scanFile(filePath);
    if (tests.length > 0) {
      results.push({ filePath, tests });
    }
  }
  return results;
}

/**
 * Scan a single document (used when editor is open) for tests.
 * Useful for code lens: we re-scan the file when content changes so line numbers stay correct.
 */
export function scanDocument(document: vscode.TextDocument): ScannedTest[] {
  const text = document.getText();
  const tests: ScannedTest[] = [];
  const run = (regex: RegExp, kind: TestKind) => {
    const matches = findMatches(text, regex, kind);
    for (const m of matches) {
      tests.push({
        suiteName: m.suiteName,
        testName: m.testName,
        line: m.line,
        kind,
        fullName: `${m.suiteName}.${m.testName}`
      });
    }
  };
  run(TEST_REGEX, 'TEST');
  run(TEST_F_REGEX, 'TEST_F');
  run(TEST_P_REGEX, 'TEST_P');
  return tests;
}
