import * as _ from "lodash";
import * as mobx from "mobx";
import { StorageEntryPointer, StorageErrorCode, StorageLayer } from "../storage/StorageLayer";
import { StoragePath } from "../storage/StoragePath";
import { ContentIdentity, getContentIdentity, isDirIdentity, readEntityTextIfAny } from "./ContentIdentity";
import { SyncResult, SyncResultAction } from "./RemoteSync";
import { SyncEntry, walkSyncEntriesDownToTop } from "./SyncEntry";
import { SyncMetadataMap, SyncMetadataStorage } from "./SyncMetadataStorage";
import { SyncProvider } from "./SyncProvider";


export interface PendingConflict {
  ts: Date;
  syncResult: SyncResult;
}


export class LocalSyncWorker {
  constructor(syncProvider: SyncProvider, syncMetadata: SyncMetadataStorage) {
    this.syncMetadata = syncMetadata;
    this.syncProvider = syncProvider;

    this.debouncedNextSync = _.debounce(this.processNextSyncWrapper.bind(this), 5000);

    mobx.makeObservable(this, {
      pendingConflicts: mobx.observable,
      pendingRoots: mobx.observable,
      lastSyncDate: mobx.observable,
      lastSyncOk: mobx.observable,
      syncingNow: mobx.observable,
      lastSyncError: mobx.observable,
      syncErrors: mobx.observable,
    });

    setInterval(() => this.debouncedNextSync(), 10000);
  }


  lastSyncDate: Date | undefined = undefined;
  lastSyncOk: boolean | undefined = true;
  syncingNow = false;
  lastSyncError: string | undefined = undefined;
  syncErrors: { ts: Date, text: string }[] = [];

  /**
   * List of roots that wait to be synced with remote
   */
  pendingRoots: StorageEntryPointer[] = [];
  pendingConflicts: PendingConflict[] = [];

  private sendDataOnNextSync = new Set<string>();
  private readonly syncMetadata: SyncMetadataStorage;
  private readonly syncProvider: SyncProvider;


  addRoot(ep: StorageEntryPointer) {
    for (const root of this.pendingRoots) {
      if (ep.path.inside(root.path) || ep.path.isEqual(root.path)) {
        return;
      }
    }

    this.pendingRoots.push(ep);

    if (this.syncingNow) {
      return;
    }

    this.debouncedNextSync()?.catch(err => console.error("Sync failed:", err));
  }


  runSync() {
    this.processNextSyncWrapper().catch(err => console.error("Sync failed:", err));
  }


  private debouncedNextSync: () => Promise<void> | undefined;


  private async processNextSyncWrapper(): Promise<void> {
    try {
      this.syncingNow = true;

      await this.sync();

      this.lastSyncOk = true;
      this.lastSyncDate = new Date();
    } catch (error: any) {
      this.lastSyncOk = false;
      console.error("Sync failed:", error);
      this.lastSyncError = error.message;
    } finally {
      this.syncingNow = false;
    }
  }


  async sync(): Promise<void> {
    while (this.pendingRoots.length > 0) {
      await this.processNextSync();
    }
  }


  private async processNextSync(): Promise<void> {
    const root = this.pendingRoots[0];
    if (!root) {
      return;
    }

    const syncEntry = await this.getSyncEntry(root.path, root, await this.syncMetadata.get());
    const syncResults = await this.syncProvider.sync(syncEntry);

    let updatedMetadata: SyncMetadataMap = {};
    const mentionedPaths = new Set<string>();
    for (const result of syncResults) {
      await this.applySyncResult(root.storage, result, updatedMetadata);
      mentionedPaths.add(result.path);
    }

    // we need to write metadata for files that were synced and are identical to remote counterparts
    // these files are not mentioned in remote reply, so we need to save their identities we sent to remote
    for (const se of walkSyncEntriesDownToTop(syncEntry)) {
      if (se.identity && !se.path.isEqual(StoragePath.root) && !mentionedPaths.has(se.path.normalized)) {
        updatedMetadata[se.path.normalized] = se.identity;
      }
    }

    await this.syncMetadata.setMulti(updatedMetadata);

    this.pendingConflicts = syncResults.filter(r => "conflict" in r).map(r => ({
      ts: new Date(),
      syncResult: r
    }));

    this.pendingRoots.shift();
  }


  private async getEntryChildren(path: StoragePath, sp: StorageEntryPointer | undefined, metadata: SyncMetadataMap): Promise<SyncEntry[]> {
    const result: SyncEntry[] = [];
    const seen = new Set<string>();

    if (sp && (await this.getSafeStats(sp))?.isDirectory) {
      const children = await sp.children();
      for (const child of children) {
        result.push(await this.getSyncEntry(child.path, child, metadata));
        seen.add(child.path.normalized);
      }
    }

    for (const key of Object.keys(metadata)) {
      if (!seen.has(key) && new StoragePath(key).parentDir.isEqual(path)) {
        result.push(await this.getSyncEntry(new StoragePath(key), undefined, metadata));
      }
    }

    return result;
  }


  private async getSafeStats(sp: StorageEntryPointer) {
    try {
      return await sp.stats();
    } catch (err: any) {
      return undefined;
    }
  }


  private async getSyncEntry(path: StoragePath, sp: StorageEntryPointer | undefined, metadata: SyncMetadataMap): Promise<SyncEntry> {
    const syncedIdentity = metadata[path.normalized];
    const curIdentity = sp ? await getContentIdentity(sp) : undefined;

    let data: string | undefined;
    if (sp && this.sendDataOnNextSync.has(sp.path.normalized)) {
      data = await readEntityTextIfAny(sp);
      if (data == null) { // data can be an empty string, but we get `undefined` when a file does not exist
        // todo: handle this
        throw new Error("Failed to provide data for entry: " + sp.path.normalized);
      }
      this.sendDataOnNextSync.delete(sp.path.normalized);
    }

    const children = await this.getEntryChildren(path, sp, metadata);

    return {
      path,
      synced: syncedIdentity,
      identity: curIdentity,
      children,
      data
    };
  }


  async applySyncResult(storage: StorageLayer, result: SyncResult, metadataUpdate: SyncMetadataMap) {
    if (!("action" in result)) {
      return;
    }

    switch (result.action) {
      case SyncResultAction.Updated:
      case SyncResultAction.Created:
        metadataUpdate[result.path] = result.identity;
        break;

      case SyncResultAction.Removed:
        metadataUpdate[result.path] = undefined;
        break;

      case SyncResultAction.CreateDataRequired:
      case SyncResultAction.UpdateDataRequired:
        this.sendDataOnNextSync.add(result.path);
        this.pendingRoots.unshift(storage.get(new StoragePath(result.path)));
        break;

      case SyncResultAction.LocalUpdateRequired:
      case SyncResultAction.LocalCreateRequired: {
        try {
          await this.updateLocalEntry(storage.get(new StoragePath(result.path)), result.identity, result.data);
          metadataUpdate[result.path] = result.identity;
        } catch (err: any) {
          console.error(`Failed to create/update "${ result.path }": ${ err.message }`, err);
          this.syncErrors.push({ ts: new Date(), text: `Failed to create/update "${ result.path }": ${ err.message }` });
        }
        break;
      }

      case SyncResultAction.LocalRemoveRequired: {
        try {
          const wp = storage.get(new StoragePath(result.path));
          await wp.remove();
        } catch (err: any) {
          if (err.code !== StorageErrorCode.NotExists) {
            this.syncErrors.push({ ts: new Date(), text: `Failed to remove "${ result.path }": ${ err.message }` });
          }
        }
        break;
      }
    }
  }


  private async updateLocalEntry(p: StorageEntryPointer, identity: ContentIdentity | undefined, data: string | Buffer | undefined): Promise<void> {
    if (identity && isDirIdentity(identity)) {
      try {
        const existing = await p.stats();
        if (!existing.isDirectory) {
          await p.remove();
        }
      } catch (err: any) {
        if (err.code === StorageErrorCode.NotExists) {
          return;
        } else {
          throw err;
        }
      }

      try {
        await p.createDir();
      } catch (err: any) {
        if (err.code === StorageErrorCode.AlreadyExists) {
          // it can happen if the directory was created automatically when writing to another file
          return;
        } else {
          throw err;
        }
      }
    } else {
      if (data == null) {
        throw new Error(`No data provided by server`);
      } else {
        await p.writeOrCreate(data);
      }
    }
  }
}
