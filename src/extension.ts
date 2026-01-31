import * as vscode from 'vscode';

// Showing side panel
export class MyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "GTestList";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <h3>Hello 👋</h3>
        <p>This is an empty panel.</p>
      </body>
      </html>
    `;
  }
}

// Activating extension
export function activate(context: vscode.ExtensionContext) {
    console.log('Starting GTest Plugin');


    const disposable = vscode.commands.registerCommand('gtest-plugin.helloWorld', () => {
        // Message box pop up
        vscode.window.showInformationMessage('Hello World from gtest-plugin!');
    });

    // Creating side panel view
    const provider = new MyViewProvider(context);

    // Registering command and side panel view
    context.subscriptions.push(disposable);
    context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MyViewProvider.viewType,
      provider
    )
  );
}

// Deactivating extension
export function deactivate() {}
