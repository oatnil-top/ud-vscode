import * as vscode from "vscode";
import * as path from "path";
import { checkCli } from "./cli";
import { getConfig, getSyncDir } from "./config";
import * as sync from "./sync";
import * as files from "./files";

export async function activate(context: vscode.ExtensionContext) {
  // Check CLI availability
  const cliAvailable = await checkCli();
  if (!cliAvailable) {
    vscode.window.showErrorMessage(
      'ud: CLI not found. Install ud or set "ud.udBin" in settings.'
    );
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("ud.sync", () => sync.sync()),
    vscode.commands.registerCommand("ud.syncFull", () =>
      sync.sync({ full: true })
    ),
    vscode.commands.registerCommand("ud.syncWatch", () => sync.watchStart()),
    vscode.commands.registerCommand("ud.syncStop", () => sync.watchStop()),
    vscode.commands.registerCommand("ud.list", () => files.browse()),
    vscode.commands.registerCommand("ud.newTask", () => files.newTask()),
    vscode.commands.registerCommand("ud.newNote", () => files.newNote()),
    vscode.commands.registerCommand("ud.explore", () => files.explore())
  );

  // Status bar
  const statusBar = sync.createStatusBar();
  context.subscriptions.push(statusBar);

  // Auto-sync on save
  const { autoSync, syncDir } = getConfig();
  if (autoSync && syncDir) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const filePath = doc.uri.fsPath;
        const resolvedSyncDir = getSyncDir();
        if (
          resolvedSyncDir &&
          filePath.startsWith(resolvedSyncDir) &&
          filePath.endsWith(".md")
        ) {
          sync.applyFile(filePath);
        }
      })
    );
  }

  // Auto-start watch if configured
  if (getConfig().watchOnStartup) {
    sync.watchStart();
  }
}

export function deactivate() {
  sync.dispose();
}
