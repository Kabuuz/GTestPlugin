import * as vscode from 'vscode';

const CHANNEL_NAME = 'GTest Debug';
let channel: vscode.OutputChannel | undefined;

export function getLogChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

export function logInfo(message: string): void {
  const ch = getLogChannel();
  ch.appendLine(`[INFO] ${message}`);
}

export function logError(message: string): void {
  const ch = getLogChannel();
  ch.appendLine(`[ERROR] ${message}`);
}
