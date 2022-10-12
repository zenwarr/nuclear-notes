import { WorkspaceSettingsProvider } from "@storage/workspace-settings-provider";
import { StorageEntryData } from "@storage/storage-entry-data";
import { MemoryCachedStorage } from "@storage/memory-cached-storage";
import { EntryStorage, StorageEntryType } from "@storage/entry-storage";
import { StoragePath } from "@storage/storage-path";
import { Sync } from "@sync/sync";
import { isConflictingDiff } from "@sync/sync-diff-type";
import { SyncTargetProvider } from "@sync/sync-target-provider";
import { SyncDiffEntry } from "@sync/sync-diff-entry";
import { DiffAction } from "@sync/sync-metadata-storage";
import { SyncJobRunner } from "@sync/sync-job-runner";
import { makeObservable, observable } from "mobx";
import { PluginManager } from "../plugin/plugin-manager";
import { RecentDocStorage } from "../RecentDocStorage";
import { getFileRoutePath } from "./routing";
import { ThemeConfig } from "theme/theme-config";


export class Workspace {
  constructor(storage: EntryStorage, syncTarget: SyncTargetProvider | undefined, storageName: string) {
    makeObservable(this, {
      loading: observable,
      loadError: observable,
      _openedPath: observable,
      editorReloadTrigger: observable,
      themeConfig: observable
    } as any);

    this.storage = new MemoryCachedStorage(storage);
    this.remoteStorageName = storageName;

    WorkspaceSettingsProvider.init(this.storage);
    this.plugins = new PluginManager(this.storage);

    if (syncTarget) {
      this.sync = new Sync(
          this.storage,
          syncTarget
      );
      this.syncJobRunner = new SyncJobRunner(this.sync);
    }
  }


  // todo: remove
  readonly remoteStorageName: string;
  loading = true;
  loadError: string | undefined;


  async load() {
    try {
      await this.plugins.discoverPlugins();

      await WorkspaceSettingsProvider.instance.init();
      this.themeConfig = WorkspaceSettingsProvider.instance.settings?.theme;

      this.loading = false;
    } catch (error: any) {
      console.error("Error initializing workspace", error);
      this.loadError = error.message;
      this.loading = false;
    }

    // run and forget
    setTimeout(async () => {
      await this.storage.initWithRemoteOutline();

      try {
        await this.sync?.updateDiff(StoragePath.root);
      } catch (e) {
        console.error("Failed to update diff: ", e);
      }

      await this.syncJobRunner?.run();
    }, 500);
  }


  walk(cb: (entry: StorageEntryData) => boolean) {
    function walkList(entries: StorageEntryData[] | undefined): boolean {
      for (const e of entries || []) {
        if (cb(e)) {
          return true;
        }

        if (walkList(e.children)) {
          return true;
        }
      }

      return false;
    }

    walkList(this.storage.getMemoryData(StoragePath.root)?.children || []);
  }


  async createEntry(path: StoragePath, type: StorageEntryType): Promise<void> {
    if (type === StorageEntryType.File && !path.normalized.match(/\.[a-z]+$/)) {
      path = new StoragePath(path.normalized + ".md");
    }

    const entry = this.storage.get(path);
    if (type === StorageEntryType.File) {
      await entry.writeOrCreate(Buffer.alloc(0));
    } else {
      await entry.createDir();
    }

    this.scheduleDiffUpdate(entry.path);

    if (type === "file") {
      this.navigateToPath(path);
    }
  }


  async remove(path: StoragePath) {
    if (this.openedPath && path.isEqual(this.openedPath)) {
      const parentPath = path.parentDir;
      if (parentPath.isEqual(StoragePath.root)) {
        this.navigateToPath(undefined);
      } else {
        this.navigateToPath(parentPath);
      }
    }

    const pointer = await this.storage.get(path);
    await pointer.remove();

    this.scheduleDiffUpdate(pointer.path);
  }


  async acceptChangeTree(path: StoragePath, diff: SyncDiffEntry[]) {
    let syncDiffEntries = diff.filter(e => e.path.inside(path, true) && !isConflictingDiff(e.type));
    await this.sync?.acceptMulti(syncDiffEntries);
  }


  async acceptChanges(diff: SyncDiffEntry, action: DiffAction) {
    await this.sync?.accept(diff, action);
  }


  get openedPath() {
    return this._openedPath;
  }


  navigateToPath(path: StoragePath | undefined): void {
    if (path) {
      this.navigator?.(getFileRoutePath(path));
    } else {
      this.navigator?.("/");
    }
  }


  onNavigate(path: StoragePath | undefined) {
    if (path == null) {
      this._openedPath = undefined;
    } else {
      const entry = this.storage.getMemoryData(path);
      if (entry && !entry.stats.isDirectory) {
        this._openedPath = path;
        RecentDocStorage.instance.saveLastOpenedDoc(path.normalized);
      }
    }
  }


  scheduleDiffUpdate(start: StoragePath) {
    setTimeout(async () => {
      if (this.sync) {
        await this.sync.updateDiff(start);
      }
    }, 0);
  }


  triggerEditorReload() {
    this.editorReloadTrigger++;
  }


  setNavigator(navigator: undefined | ((path: string) => void)) {
    this.navigator = navigator;

    const lastOpenedDoc = RecentDocStorage.instance.getLastOpenedDoc();
    if (lastOpenedDoc) {
      const lastOpenedDocPath = new StoragePath(lastOpenedDoc);
      this._openedPath = lastOpenedDocPath;
      this.navigateToPath(lastOpenedDocPath);
    }
  }


  private _openedPath: StoragePath | undefined = undefined;
  storage: MemoryCachedStorage;
  sync: Sync | undefined;
  syncJobRunner: SyncJobRunner | undefined;
  plugins: PluginManager;
  editorReloadTrigger = 0;
  navigator: undefined | ((path: string) => void);
  themeConfig: ThemeConfig | undefined;

  private static _instance: Workspace | undefined;


  static get instanceInited() {
    return this._instance != null;
  }


  static get instance() {
    if (!this._instance) {
      throw new Error("Workspace is not initialized");
    }

    return this._instance;
  }


  static init(storage: EntryStorage, syncTarget: SyncTargetProvider | undefined) {
    this._instance = new Workspace(storage, syncTarget, "default");
  }
}


makeObservable(Workspace, {
  _instance: observable
} as any);
