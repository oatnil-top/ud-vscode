# UnDercontrol for VS Code

Sync and edit [UnDercontrol](https://undercontrol.io) tasks as plain markdown files.

## Requirements

- [ud CLI](https://undercontrol.io) installed and configured

## Setup

1. Install the extension
2. Set `ud.syncDir` in settings to your local sync directory
3. Run **UnDercontrol: Sync Full** from the command palette to pull all tasks

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ud.udBin` | `"ud"` | Path to the ud CLI binary |
| `ud.syncDir` | `""` | Local sync directory (required) |
| `ud.autoSync` | `true` | Auto-apply on save for files in sync dir |
| `ud.watchOnStartup` | `false` | Start watch mode when VS Code opens |
| `ud.watchInterval` | `"30s"` | Poll interval for watch mode |
| `ud.defaultStatus` | `"todo"` | Default status for new tasks |
| `ud.defaultTags` | `[]` | Default tags for new tasks |

## Commands

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "UnDercontrol":

| Command | Description |
|---------|-------------|
| **Sync** | Run bidirectional sync |
| **Sync Full (pull all)** | Pull all tasks from server |
| **Start Watch Mode** | Continuous background sync |
| **Stop Watch Mode** | Stop background sync |
| **Browse Tasks** | Quick pick to search and open tasks |
| **New Task** | Create a new task file |
| **New Note** | Create a note linked to the current task |
| **Open Sync Folder** | Open the sync directory in VS Code |

## How it works

1. **Sync Full** pulls all tasks as `.md` files into your sync dir
2. **Edit** markdown files normally — YAML frontmatter holds task metadata
3. **Save** applies the file to the server and writes back metadata (id, timestamps)
4. **Watch mode** syncs continuously in the background
5. If a task was deleted from remote, you'll be prompted to delete the local file

## Status bar

The status bar shows sync state — click to trigger a sync or stop watch mode.
