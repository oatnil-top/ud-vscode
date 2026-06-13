import { execFile, ChildProcess, spawn } from "child_process";
import { getConfig } from "./config";

/**
 * Run a ud CLI command and return stdout.
 */
export function run(args: string[]): Promise<{ ok: boolean; output: string }> {
  const { udBin } = getConfig();

  return new Promise((resolve) => {
    execFile(udBin, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errMsg = stderr?.trim() || stdout?.trim() || error.message;
        resolve({ ok: false, output: errMsg });
      } else {
        resolve({ ok: true, output: stdout.trim() });
      }
    });
  });
}

/**
 * Spawn a long-running ud CLI process (e.g., watch mode).
 */
export function spawnProcess(
  args: string[],
  callbacks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    onExit?: (code: number | null) => void;
  }
): ChildProcess {
  const { udBin } = getConfig();
  const proc = spawn(udBin, args);

  proc.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      callbacks.onStdout?.(line);
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      callbacks.onStderr?.(line);
    }
  });

  proc.on("exit", (code) => {
    callbacks.onExit?.(code);
  });

  return proc;
}

/**
 * Check if the ud CLI is available.
 */
export async function checkCli(): Promise<boolean> {
  const result = await run(["--version"]);
  return result.ok;
}
