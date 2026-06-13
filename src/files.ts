import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getConfig, getSyncDir } from "./config";

interface TaskEntry {
  path: string;
  filename: string;
  title: string;
  status: string;
  id: string;
}

interface Frontmatter {
  [key: string]: string | string[] | boolean;
}

/**
 * Parse YAML frontmatter from file content.
 */
function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split("\n");
  if (lines[0] !== "---") return null;

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;

  const fm: Frontmatter = {};
  for (let i = 1; i < endIdx; i++) {
    const match = lines[i].match(/^(\S+):\s*(.*)$/);
    if (match) {
      let value = match[2].replace(/^['"](.+)['"]$/, "$1");
      // Parse YAML lists: [tag1, tag2]
      const listMatch = value.match(/^\[(.*)]/);
      if (listMatch) {
        fm[match[1]] = listMatch[1].split(",").map((s) => s.trim());
      } else if (value === "") {
        fm[match[1]] = true;
      } else {
        fm[match[1]] = value;
      }
    }
  }
  return fm;
}

/**
 * Scan sync directory for task .md files.
 */
function scanTasks(filter?: { status?: string }): TaskEntry[] {
  const syncDir = getSyncDir();
  if (!syncDir || !fs.existsSync(syncDir)) return [];

  const files = fs.readdirSync(syncDir).filter((f) => f.endsWith(".md"));
  const tasks: TaskEntry[] = [];

  for (const filename of files) {
    if (filename === "UDSYNC.md") continue;

    const filepath = path.join(syncDir, filename);
    const stat = fs.statSync(filepath);
    if (!stat.isFile()) continue;

    // Read first ~30 lines for frontmatter
    const content = fs.readFileSync(filepath, "utf-8");
    const firstChunk = content.split("\n").slice(0, 30).join("\n");
    const fm = parseFrontmatter(firstChunk);

    // Skip notes (have task_id)
    if (fm && fm.task_id) continue;

    // Apply status filter
    if (filter?.status && fm && fm.status !== filter.status) continue;

    const title = (fm?.title as string) || filename.replace(/\.md$/, "");
    const status = (fm?.status as string) || "?";
    const id = (fm?.id as string) || "";

    tasks.push({ path: filepath, filename, title, status, id });
  }

  return tasks;
}

/**
 * Sanitize a string for use as a filename.
 */
function sanitizeFilename(name: string): string {
  let safe = name.replace(/[/\\:*?"<>|%!#$&'()+,;=@[\]^{}~]/g, "-");
  safe = safe.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-/, "").replace(/-$/, "");
  if (safe.length > 100) safe = safe.substring(0, 100);
  return safe || "untitled";
}

/**
 * Browse tasks via quick pick and open the chosen one.
 */
export async function browse(statusFilter?: string) {
  const tasks = scanTasks(statusFilter ? { status: statusFilter } : undefined);

  if (tasks.length === 0) {
    vscode.window.showWarningMessage("ud: no tasks found in sync dir");
    return;
  }

  // Sort: in-progress first, then todo, then rest
  const priority: Record<string, number> = {
    "in-progress": 1,
    todo: 2,
    pending: 3,
    done: 4,
  };
  tasks.sort((a, b) => {
    const pa = priority[a.status] ?? 99;
    const pb = priority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title);
  });

  const items = tasks.map((t) => ({
    label: t.title,
    description: t.status,
    detail: t.id ? t.id.substring(0, 8) : undefined,
    task: t,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select task to open",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.task.path);
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Open a task by ID.
 */
export async function open(taskId: string) {
  const tasks = scanTasks();
  const idLower = taskId.toLowerCase();
  const task = tasks.find(
    (t) => t.id && t.id.toLowerCase().startsWith(idLower)
  );

  if (task) {
    const doc = await vscode.workspace.openTextDocument(task.path);
    await vscode.window.showTextDocument(doc);
  } else {
    vscode.window.showWarningMessage(`ud: task ${taskId} not found in sync dir`);
  }
}

/**
 * Create a new task file.
 */
export async function newTask() {
  const syncDir = getSyncDir();
  if (!syncDir) return;

  const title = await vscode.window.showInputBox({
    prompt: "Task title",
    placeHolder: "Enter task title",
  });

  if (!title) return;

  const { defaultStatus, defaultTags } = getConfig();

  // Build frontmatter
  const fmLines = ["---", `title: ${title}`, `status: ${defaultStatus}`];
  if (defaultTags.length > 0) {
    fmLines.push(`tags: [${defaultTags.join(", ")}]`);
  }
  fmLines.push("---", "", "");

  const content = fmLines.join("\n");
  const filename = sanitizeFilename(title);

  let filepath = path.join(syncDir, `${filename}.md`);
  let counter = 1;
  while (fs.existsSync(filepath)) {
    filepath = path.join(syncDir, `${filename}-${counter}.md`);
    counter++;
  }

  // Ensure sync dir exists
  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true });
  }

  fs.writeFileSync(filepath, content, "utf-8");

  const doc = await vscode.workspace.openTextDocument(filepath);
  const editor = await vscode.window.showTextDocument(doc);
  // Place cursor at end
  const lastLine = doc.lineCount - 1;
  editor.selection = new vscode.Selection(lastLine, 0, lastLine, 0);
}

/**
 * Create a new note linked to the current task.
 */
export async function newNote() {
  const syncDir = getSyncDir();
  if (!syncDir) return;

  // Try to get task_id from current editor
  let taskId: string | undefined;
  let taskTitle: string | undefined;

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const content = editor.document.getText();
    const fm = parseFrontmatter(content);
    if (fm) {
      taskId = fm.id as string;
      taskTitle = fm.title as string;
    }
  }

  if (!taskId) {
    taskId = await vscode.window.showInputBox({
      prompt: "Task ID",
      placeHolder: "Enter the task ID to link this note to",
    });
    if (!taskId) return;
  }

  if (!taskTitle) {
    taskTitle = taskId.substring(0, 8);
  }

  const safeTitle = sanitizeFilename(taskTitle).substring(0, 50);
  let filepath = path.join(syncDir, `${safeTitle}-Note.md`);
  let counter = 1;
  while (fs.existsSync(filepath)) {
    filepath = path.join(syncDir, `${safeTitle}-Note-${counter}.md`);
    counter++;
  }

  const content = [
    "---",
    `task_id: ${taskId}`,
    "title: ",
    "---",
    "",
    "",
  ].join("\n");

  fs.writeFileSync(filepath, content, "utf-8");

  const doc = await vscode.workspace.openTextDocument(filepath);
  const ed = await vscode.window.showTextDocument(doc);
  // Place cursor on the title line
  ed.selection = new vscode.Selection(2, 7, 2, 7);
}

/**
 * Open the sync folder in the explorer.
 */
export async function explore() {
  const syncDir = getSyncDir();
  if (!syncDir) return;

  const uri = vscode.Uri.file(syncDir);
  await vscode.commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: false,
  });
}
