import { StoragePath } from "@storage/storage-path";
import { ContentIdentity } from "@sync/content-identity";
import { isCleanLocalDiff, isConflictingDiff, SyncDiffType } from "@sync/sync-diff-type";
import { DiffAction, EntrySyncMetadata } from "@sync/sync-metadata-storage";


export interface SyncDiffEntry {
  path: StoragePath;
  type: SyncDiffType;
  actual: ContentIdentity | undefined;
  remote: ContentIdentity | undefined;
  syncMetadata: EntrySyncMetadata | undefined;
}


/**
 * Checks if accepted state can no longer be used because actual state has been changed after accepting
 */
export function isAcceptedStateLost(diff: SyncDiffEntry): boolean | undefined {
  if (!diff.syncMetadata) {
    return undefined;
  }

  const readLocal = shouldReadFromLocalToAccept(diff.syncMetadata);
  if (readLocal == null) {
    return undefined;
  }

  return readLocal ? diff.actual !== diff.syncMetadata.accepted : diff.remote !== diff.syncMetadata.accepted;
}


export function shouldReadFromLocalToAccept(syncMetadata: EntrySyncMetadata): boolean | undefined {
  if (!syncMetadata || !syncMetadata.action || !syncMetadata.diff) {
    return undefined;
  }

  const action = syncMetadata.action;
  if (isConflictingDiff(syncMetadata.diff)) {
    if (action === DiffAction.AcceptLocal) {
      return true;
    } else if (action === DiffAction.AcceptRemote) {
      return false;
    } else {
      return undefined;
    }
  } else if (isCleanLocalDiff(syncMetadata.diff)) {
    return action === DiffAction.AcceptAuto || action === DiffAction.AcceptLocal;
  } else {
    return action === DiffAction.AcceptRemote;
  }
}


export function isAccepted(d: SyncDiffEntry): boolean {
  return d.syncMetadata != null && d.syncMetadata.accepted === d.actual;
}


/**
 * Returns true if this entry should be processed as a job
 * @param d
 */
export function isActionable(d: SyncDiffEntry): boolean {
  return d.syncMetadata != null && d.syncMetadata.action != null && d.syncMetadata.diff != null;
}


export function* walkSyncDiffEntriesDownToTop(entries: SyncDiffEntry[]): Generator<SyncDiffEntry> {
  const levels = new Map<number, SyncDiffEntry[]>();
  for (const entry of entries) {
    const level = entry.path.parts.length;
    const levelEntries = levels.get(level) || [];
    levelEntries.push(entry);
    levels.set(level, levelEntries);
  }

  const levelsSorted = [ ...levels.keys() ].sort((a, b) => b - a);
  for (const level of levelsSorted) {
    const levelEntries = levels.get(level)!;
    for (const entry of levelEntries) {
      yield entry;
    }
  }
}
