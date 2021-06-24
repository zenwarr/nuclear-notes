import { CreateEntryReply, WorkspaceEntry } from "../common/WorkspaceEntry";
import { makeObservable, observable } from "mobx";
import { WorkspaceBackend } from "./backend/WorkspaceBackend";
import { Backend } from "./backend/Backend";


export class WorkspaceManager {
  constructor() {
    makeObservable(this, {
      entries: observable,
      selectedEntryPath: observable
    });
  }


  async load() {
    this.entries = await Backend.get(WorkspaceBackend).loadTree();
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


  async createEntry(parent: string, name: string | undefined, type: "file" | "dir"): Promise<CreateEntryReply> {
    const reply = await Backend.get(WorkspaceBackend).createEntry(parent, name, type);
    this.entries = reply.entries;
    this.selectedEntryPath = reply.path;
    return reply;
  }


  entries: WorkspaceEntry[] = [];
  selectedEntryPath: string | undefined = undefined;

  static instance = new WorkspaceManager();
}
