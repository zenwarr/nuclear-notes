import { EntryStorage } from "@storage/entry-storage";
import { StoragePath } from "@storage/storage-path";


export namespace SpecialPath {
  export const SpecialRoot = new StoragePath(".note");
  export const SecretsDir = new StoragePath(".note/secrets");
  export const PluginsDir = new StoragePath(".note/plugins");
  export const Settings = new StoragePath(".note/settings.json");
  export const SyncDir = new StoragePath(".sync");
  export const SyncStorageConfig = new StoragePath(".sync/settings.json");
  export const Git = new StoragePath(".git");
}


export async function createWorkspaceDefaults(fs: EntryStorage) {
  await fs.createDir(SpecialPath.SpecialRoot);
  await fs.get(SpecialPath.Settings).writeOrCreate(Buffer.from("{\n  \n}"));
}
