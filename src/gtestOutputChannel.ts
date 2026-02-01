/**
 * GTest output in the bottom panel (Output tab, same place as Terminal/Debug Console).
 * Uses VS Code OutputChannel so logs are readable and support built-in Find (Ctrl+F).
 */

import * as vscode from 'vscode';
import { testStore } from './testStore';

const CHANNEL_NAME = 'GTest';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

/**
 * Append test run output to the GTest channel and reveal the Output panel.
 * Call this after running tests so logs appear in the bottom panel.
 */
export function appendTestRun(
  executable: string,
  fullNames: string[],
  output: string
): void {
  const ch = getChannel();
  const header = `\n========== ${executable} :: ${fullNames.join(', ')} ==========\n`;
  ch.appendLine(header);
  ch.append(output);
  if (!output.endsWith('\n')) ch.appendLine('');
  ch.show(true);
}

/**
 * Show a single test's last run output in the GTest channel and reveal the Output panel.
 * Call this when user clicks "Show test output" on a test.
 */
export function showTestOutputFor(executable: string, fullName: string): void {
  const output = testStore.getOutput(executable, fullName);
  const ch = getChannel();
  ch.clear();
  const header = `========== ${executable} :: ${fullName} (last run) ==========\n`;
  ch.appendLine(header);
  ch.append(output || '(No output yet. Run the test first.)');
  if (!output?.endsWith('\n')) ch.appendLine('');
  ch.show(true);
}
