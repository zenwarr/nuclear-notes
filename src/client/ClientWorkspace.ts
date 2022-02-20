import { makeObservable, observable } from "mobx";
import { RecentDocStorage } from "./RecentDocStorage";
import { StoragePath } from "../common/storage/StoragePath";
import { MemoryStorageEntryPointer } from "./storage/MemoryStorage";
import { MemoryCachedStorage } from "../common/storage/MemoryCachedStorage";
import { StorageEntryType } from "../common/storage/StorageLayer";
import { FileSettingsProvider } from "../common/workspace/FileSettingsProvider";


export class ClientWorkspace {
  constructor(storage: MemoryCachedStorage, storageId: string) {
    makeObservable(this, {
      loading: observable,
      _selectedEntry: observable,
      _selectedFile: observable
    } as any);

    const lastOpenedDoc = RecentDocStorage.instance.getLastOpenedDoc();
    if (lastOpenedDoc) {
      const lastOpenedDocPath = new StoragePath(lastOpenedDoc);
      this._selectedEntry = lastOpenedDocPath;
      this._selectedFile = lastOpenedDocPath;
    }

    this.storage = storage;
    this.remoteStorageId = storageId;
  }


  readonly remoteStorageId: string;
  loading = true;


  async load() {
    const allEntries = await this.storage.loadAll();
    if (!allEntries) {
      throw new Error(`Failed to load storage entries: loadAll returns undefined`);
    }

    this.storage.memory.root.initialize(allEntries);

    await FileSettingsProvider.instance.load();

    this.loading = false;
  }


  walk(cb: (entry: MemoryStorageEntryPointer) => boolean) {
    function walkList(list: MemoryStorageEntryPointer[] | undefined): boolean {
      for (const e of list || []) {
        if (cb(e)) {
          return true;
        }

        if (walkList(e.directChildren)) {
          return true;
        }
      }

      return false;
    }

    walkList(this.storage.get(StoragePath.root).memory.directChildren || []);
  }


  async createEntry(path: StoragePath, type: StorageEntryType): Promise<void> {
    if (type === StorageEntryType.File && !path.normalized.match(/\.[a-z]+$/)) {
      path = new StoragePath(path.normalized + ".md");
    }

    if (type === StorageEntryType.File) {
      const entry = this.storage.get(path);
      await entry.writeOrCreate("");
    } else {
      await this.storage.createDir(path);
    }

    if (type === "file") {
      this.selectedEntry = path;
    }
  }


  async remove(path: StoragePath) {
    if (this.selectedEntry && path.isEqual(this.selectedEntry)) {
      const parentPath = path.parentDir;
      if (parentPath.isEqual(StoragePath.root)) {
        this.selectedEntry = undefined;
      } else {
        this.selectedEntry = parentPath;
      }
    }

    const pointer = await this.storage.get(path);
    await pointer.remove();
  }


  get selectedEntry() {
    return this._selectedEntry;
  }


  set selectedEntry(path: StoragePath | undefined) {
    this._selectedEntry = path;

    if (path == null) {
      this._selectedFile = undefined;
    } else {
      const entry = this.storage.get(path);
      if (entry && entry.memory.type === StorageEntryType.File) {
        this._selectedFile = path;
        RecentDocStorage.instance.saveLastOpenedDoc(path.normalized);
      }
    }
  }


  get selectedFile() {
    return this._selectedFile;
  }


  private _selectedEntry: StoragePath | undefined = undefined;
  private _selectedFile: StoragePath | undefined = undefined;
  storage: MemoryCachedStorage;
  private static _instance: ClientWorkspace | undefined;


  static get instance() {
    if (!this._instance) {
      throw new Error("ClientWorkspace is not initialized");
    }

    return this._instance;
  }


  static init(storage: MemoryCachedStorage, wsId: string) {
    this._instance = new ClientWorkspace(storage, wsId);
  }
}