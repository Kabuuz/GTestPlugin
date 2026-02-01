/**
 * Global store for test run results (passed/failed/ignored) and test output logs.
 * Used by tree view for icons and by output panel for logs.
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export type TestStatus = 'none' | 'running' | 'passed' | 'failed' | 'ignored';

/** Unique key for a test: executable + full test name (e.g. Suite.Test or Suite.Test/0). */
export function testKey(executable: string, fullName: string): string {
  return `${executable}::${fullName}`;
}

/** Single test result and log. */
export interface TestResult {
  status: TestStatus;
  /** Output (stdout + stderr) from last run. */
  output: string;
  /** When the test was last run (for "last run" display). */
  lastRunTime?: number;
}

class TestStoreImpl extends EventEmitter {
  private results = new Map<string, TestResult>();

  /** Get status for a test (executable + fullName). */
  getStatus(executable: string, fullName: string): TestStatus {
    const key = testKey(executable, fullName);
    return this.results.get(key)?.status ?? 'none';
  }

  /** Set status for a test. */
  setStatus(executable: string, fullName: string, status: TestStatus): void {
    const key = testKey(executable, fullName);
    const prev = this.results.get(key);
    this.results.set(key, {
      status,
      output: prev?.output ?? '',
      lastRunTime: prev?.lastRunTime
    });
    this.emit('changed', executable, fullName);
  }

  /** Set output for a test (after run). */
  setOutput(executable: string, fullName: string, output: string): void {
    const key = testKey(executable, fullName);
    const prev = this.results.get(key);
    this.results.set(key, {
      status: prev?.status ?? 'none',
      output,
      lastRunTime: Date.now()
    });
    this.emit('changed', executable, fullName);
  }

  /** Get output for a test (for "show test output" panel). */
  getOutput(executable: string, fullName: string): string {
    const key = testKey(executable, fullName);
    return this.results.get(key)?.output ?? '';
  }

  /** Set status for multiple tests (e.g. suite or executable run). */
  setStatusBulk(
    executable: string,
    entries: Array<{ fullName: string; status: TestStatus }>
  ): void {
    for (const e of entries) {
      const key = testKey(executable, e.fullName);
      const prev = this.results.get(key);
      this.results.set(key, {
        status: e.status,
        output: prev?.output ?? '',
        lastRunTime: prev?.lastRunTime
      });
    }
    this.emit('changed', executable, '');
  }

  /** Event when any result changed (so tree can refresh icons). */
  onChanged(cb: (executable: string, fullName: string) => void): vscode.Disposable {
    const handler = (exec: string, full: string) => cb(exec, full);
    this.on('changed', handler);
    return new vscode.Disposable(() => this.off('changed', handler));
  }
}

export const testStore = new TestStoreImpl();
