import * as vscode from "vscode";
import * as fs from "fs";
import { ChildProcess } from "child_process";
import { run, spawnProcess } from "./cli";
import { getConfig, getSyncDir } from "./config";

let watchProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;

/**
 * Run a one-shot local-sync.
 */
export async function sync(opts?: { full?: boolean; push?: boolean }) {
  const syncDir = getSyncDir();
  if (!syncDir) return;

  const args = ["local-sync"];

  if (opts?.full) {
    args.push("--full");
  } else if (opts?.push) {
    args.push("--push");
  }

  args.push("--keep-local", "--create-dir", syncDir);

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "ud: syncing..." },
    async () => {
      const result = await run(args);
      if (result.ok) {
        const summary = result.output.match(/Sync complete: (.+)/);
        if (summary && !summary[1].includes("nothing to sync")) {
          vscode.window.showInformationMessage(`ud: ${summary[1]}`);
        } else {
          vscode.window.showInformationMessage("ud: sync complete");
        }
      } else {
        vscode.window.showErrorMessage(`ud: sync failed — ${result.output}`);
      }
    }
  );
}

/**
 * Apply a single file and write back server metadata.
 */
export async function applyFile(filepath: string) {
  const result = await run(["apply", "-f", filepath]);

  if (!result.ok) {
    // Task was deleted from remote
    if (result.output.includes("Task not found") || result.output.includes("not found")) {
      const filename = filepath.split("/").pop() || filepath;
      const choice = await vscode.window.showWarningMessage(
        `Task was deleted from remote. Delete "${filename}"?`,
        "Yes, delete",
        "No, keep it"
      );
      if (choice === "Yes, delete") {
        // Close editor if open
        const uri = vscode.Uri.file(filepath);
        const editors = vscode.window.visibleTextEditors.filter(
          (e) => e.document.uri.fsPath === uri.fsPath
        );
        for (const editor of editors) {
          await vscode.window.showTextDocument(editor.document);
          await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        }
        fs.unlinkSync(filepath);
        vscode.window.showInformationMessage(`ud: deleted ${filename}`);
      }
    } else {
      vscode.window.showErrorMessage(`ud: apply failed — ${result.output}`);
    }
    return;
  }

  // Parse task ID from "Task created: <id>" or "Task updated: <id>"
  const match = result.output.match(/[Tt]ask \w+: (\S+)/);
  if (!match) return; // Note or other resource — no write-back

  const taskId = match[1];

  // Fetch canonical version with server metadata
  const describe = await run(["describe", "task", taskId, "-o", "apply"]);
  if (!describe.ok) return;

  // Write back to file
  let content = describe.output;
  if (!content.endsWith("\n")) {
    content += "\n";
  }
  fs.writeFileSync(filepath, content, "utf-8");
}

/**
 * Start watch mode.
 */
export function watchStart() {
  if (watchProcess) {
    vscode.window.showWarningMessage("ud: watch already running");
    return;
  }

  const syncDir = getSyncDir();
  if (!syncDir) return;

  const { watchInterval } = getConfig();
  const args = [
    "local-sync",
    "--watch",
    "--interval",
    watchInterval,
    "--keep-local",
    "--create-dir",
    syncDir,
  ];

  watchProcess = spawnProcess(args, {
    onStdout(line) {
      const summary = line.match(/^Sync complete: (.+)$/);
      if (summary && !summary[1].includes("nothing to sync")) {
        vscode.window.showInformationMessage(`ud: ${summary[1]}`);
      }
    },
    onStderr(line) {
      vscode.window.showWarningMessage(`ud watch: ${line}`);
    },
    onExit(code) {
      watchProcess = null;
      updateStatusBar();
      if (code !== 0) {
        vscode.window.showWarningMessage(`ud: watch stopped (exit ${code})`);
      }
    },
  });

  updateStatusBar();
  vscode.window.showInformationMessage("ud: watch started");
}

/**
 * Stop watch mode.
 */
export function watchStop() {
  if (!watchProcess) {
    vscode.window.showWarningMessage("ud: no watch running");
    return;
  }
  watchProcess.kill();
  watchProcess = null;
  updateStatusBar();
  vscode.window.showInformationMessage("ud: watch stopped");
}

/**
 * Check if watch mode is running.
 */
export function isWatching(): boolean {
  return watchProcess !== null;
}

/**
 * Create and manage the status bar item.
 */
export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  updateStatusBar();
  statusBarItem.show();
  return statusBarItem;
}

function updateStatusBar() {
  if (!statusBarItem) return;
  if (watchProcess) {
    statusBarItem.text = "$(sync~spin) ud watching";
    statusBarItem.tooltip = "UnDercontrol: watch mode active — click to stop";
    statusBarItem.command = "ud.syncStop";
  } else {
    statusBarItem.text = "$(cloud) ud";
    statusBarItem.tooltip = "UnDercontrol: click to sync";
    statusBarItem.command = "ud.sync";
  }
}

/**
 * Cleanup on deactivation.
 */
export function dispose() {
  if (watchProcess) {
    watchProcess.kill();
    watchProcess = null;
  }
  statusBarItem?.dispose();
}
