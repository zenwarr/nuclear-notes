import { CreateEntryReply, WorkspaceEntry } from "../common/WorkspaceEntry";
import { makeObservable, observable } from "mobx";
import { WorkspaceBackend } from "./backend/WorkspaceBackend";
import { Backend } from "./backend/Backend";
import { RecentDocStorage } from "./RecentDocStorage";
import { PaletteOption } from "./Palette";


export class WorkspaceManager {
  constructor() {
    makeObservable(this, {
      entries: observable,
      _selectedEntryPath: observable
    } as any);

    const lastOpenedDoc = RecentDocStorage.instance.getLastOpenedDoc();
    if (lastOpenedDoc) {
      this._selectedEntryPath = lastOpenedDoc;
    }
  }


  async load() {
    this.entries = await Backend.get(WorkspaceBackend).loadTree(this.id);
    return this.entries;
  }


  getEntryByPath(p: string): WorkspaceEntry | undefined {
    let found: WorkspaceEntry | undefined;

    this.walk(e => {
      if (e.id === p) {
        found = e;
        return true;
      } else {
        return false;
      }
    });

    return found;
  }


  walk(cb: (entry: WorkspaceEntry) => boolean) {
    function walkList(list: WorkspaceEntry[] | undefined): boolean {
      for (const e of list || []) {
        if (cb(e)) {
          return true;
        }

        if (walkList(e.children)) {
          return true;
        }
      }

      return false;
    }

    walkList(this.entries);
  }


  async createEntry(entryPath: string, type: "file" | "dir"): Promise<CreateEntryReply> {
    const reply = await Backend.get(WorkspaceBackend).createEntry(this.id, entryPath, type);
    this.entries = reply.entries;

    if (type === "file") {
      this.selectedEntryPath = reply.path;
    }

    return reply;
  }


  async remove(entryPath: string) {
    this.selectedEntryPath = undefined;
    this.entries = await Backend.get(WorkspaceBackend).removeEntry(this.id, entryPath);
  }


  get selectedEntryPath() {
    return this._selectedEntryPath;
  }


  set selectedEntryPath(id: string | undefined) {
    if (id) {
      RecentDocStorage.instance.saveLastOpenedDoc(id);
    }
    this._selectedEntryPath = id;
  }


  entries: WorkspaceEntry[] = [];
  protected _selectedEntryPath: string | undefined = undefined;
  id = "default";

  static instance = new WorkspaceManager();
}


export function workspaceFileCompleter(value: string): PaletteOption[] {
  if (!value) {
    const recentDocs = RecentDocStorage.instance.getRecentDocs();
    const recentEntries: (WorkspaceEntry | undefined)[] = [];
    WorkspaceManager.instance.walk(entry => {
      if (entry.type !== "file") {
        return false;
      }

      const recentIndex = recentDocs.indexOf(entry.id);
      if (recentIndex < 0) {
        return false;
      }

      recentEntries[recentIndex] = entry;
      return false;
    });

    return recentEntries.filter(x => x != null).map(entry => ({
      value: entry!.id,
      content: entry!.name,
      description: entry!.id
    }));
  }

  value = value.toLowerCase();

  const result: PaletteOption[] = [];
  WorkspaceManager.instance.walk(entry => {
    if (entry.type === "file" && entry.name.toLowerCase().includes(value)) {
      result.push({
        value: entry.id,
        content: entry.name,
        description: entry.id
      });
      if (result.length === 6) {
        return true;
      }
    }

    return false;
  });

  return result;
}
