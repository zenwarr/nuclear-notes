import { CreateEntryReply, EntryInfo, EntryType, WorkspaceEntry } from "../common/WorkspaceEntry";
import fs from "fs";
import path from "path";
import { ErrorCode, Result } from "../common/errors";
import { randomUUID } from "crypto";


const WORKSPACES_DIR = process.env["WORKSPACES_DIR"] ?? "/workspaces";


export class Workspace {
  private constructor(id: string) {
    this.root = path.join(WORKSPACES_DIR, id);
    this.id = id;
  }


  async getAllEntries(): Promise<Result<WorkspaceEntry[]>> {
    return { value: await getFsEntries(this.root, this.root) };
  }


  async createEntry(parent: string, name: string | undefined, type: EntryType): Promise<Result<CreateEntryReply>> {
    if (path.isAbsolute(parent)) {
      return {
        error: ErrorCode.InvalidRequestParams,
        text: "parent path should not be absolute"
      };
    }

    if (type === "dir" && !name) {
      return {
        error: ErrorCode.InvalidRequestParams,
        text: "name should be provided when creating a directory"
      };
    }

    let createdEntryPath: string;
    if (type === "dir") {
      createdEntryPath = path.join(this.root, parent, name!);
      await fs.promises.mkdir(createdEntryPath, {
        recursive: true
      });
    } else {
      await fs.promises.mkdir(path.join(this.root, parent), {
        recursive: true
      });

      const generatedFileName = randomUUID() + ".md";
      createdEntryPath = path.join(this.root, parent, generatedFileName);
      await fs.promises.writeFile(path.join(this.root, parent, generatedFileName), "", "utf-8");
    }

    const entries = await getFsEntries(this.root, this.root);
    return {
      value: {
        path: path.relative(this.root, createdEntryPath),
        entries
      }
    };
  }


  async getEntry(filePath: string): Promise<Result<EntryInfo>> {
    let content: string | undefined;
    try {
      content = await fs.promises.readFile(path.join(this.root, filePath), "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          error: ErrorCode.EntryNotFound,
          text: "entry not found"
        };
      } else {
        throw error;
      }
    }

    return {
      value: { content }
    };
  }


  async saveEntry(filePath: string, content: string): Promise<Result<void>> {
    await fs.promises.writeFile(path.join(this.root, filePath), content, "utf-8");
    return { value: undefined };
  }


  static getForId(id: string) {
    return new Workspace(id);
  }


  private readonly root: string;
  private readonly id: string;
}


const IGNORED_ENTRIES: string[] = [
  ".git",
  ".idea",
  "node_modules"
];


async function getFsEntries(dir: string, rootDir: string): Promise<WorkspaceEntry[]> {
  const result: WorkspaceEntry[] = [];

  for (const entry of await fs.promises.readdir(dir)) {
    if (IGNORED_ENTRIES.includes(entry)) {
      continue;
    }

    const fullPath = path.join(dir, entry);
    const stats = await fs.promises.stat(fullPath);

    const wEntry: WorkspaceEntry = {
      id: path.relative(rootDir, fullPath),
      name: entry,
      type: stats.isDirectory() ? "dir" : "file"
    };
    result.push(wEntry);

    if (stats.isDirectory()) {
      wEntry.children = await getFsEntries(fullPath, rootDir);
    }
  }

  return result;
}
