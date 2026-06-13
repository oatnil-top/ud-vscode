import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";

export function getConfig() {
  const config = vscode.workspace.getConfiguration("ud");
  const rawSyncDir = config.get<string>("syncDir", "~/ud-sync");
  const syncDir = rawSyncDir
    ? rawSyncDir.replace(/^~/, os.homedir())
    : "";

  return {
    udBin: config.get<string>("udBin", "ud"),
    syncDir,
    autoSync: config.get<boolean>("autoSync", true),
    watchOnStartup: config.get<boolean>("watchOnStartup", false),
    watchInterval: config.get<string>("watchInterval", "30s"),
    defaultStatus: config.get<string>("defaultStatus", "todo"),
    defaultTags: config.get<string[]>("defaultTags", []),
  };
}

export function getSyncDir(): string | undefined {
  const { syncDir } = getConfig();
  if (!syncDir) {
    vscode.window.showErrorMessage(
      'ud: syncDir not configured. Set "ud.syncDir" in settings.'
    );
    return undefined;
  }
  return syncDir;
}
