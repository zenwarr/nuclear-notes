import { StoragePath } from "@storage/storage-path";
import { ContentIdentity } from "@sync/content-identity";
import { SyncTargetProvider } from "@sync/sync-target-provider";
import * as bson from "bson";
import { SyncOutlineEntry } from "@sync/sync-entry";
import { httpRequest } from "utils/http-request";


const DEFAULT_STORAGE_NAME = "default";


export class HttpSyncProvider implements SyncTargetProvider {
  constructor(server: string, storageName = DEFAULT_STORAGE_NAME) {
    this.server = server;
    this.storageName = storageName;
  }


  private readonly storageName: string;
  private readonly server: string | undefined;


  async getId(): Promise<string> {
    const data = await (await httpRequest(`api/storages/${ this.storageName }/config`, {
      prefixUrl: this.server,
      credentials: "include",
      throwHttpErrors: false,
    })).json();

    if (!(data && typeof data === "object") || typeof (data as any).id !== "string") {
      throw new Error("Invalid response: string expected");
    }

    return (data as any).id;
  }


  async getOutline(path: StoragePath): Promise<SyncOutlineEntry | undefined> {
    return (await httpRequest(`api/storages/${ this.storageName }/sync/outline`, {
      prefixUrl: this.server,
      credentials: "include",
      throwHttpErrors: false,
      searchParams: {
        path: path.normalized
      }
    })).json();
  }


  async update(path: StoragePath, data: Buffer, remoteIdentity: ContentIdentity | undefined): Promise<void> {
    await httpRequest(`api/storages/${ this.storageName }/sync/update`, {
      method: "post",
      prefixUrl: this.server,
      credentials: "include",
      throwHttpErrors: false,
      headers: {
        "content-type": "application/bson"
      },
      body: bson.serialize({
        path: path.normalized,
        data,
        remoteIdentity
      })
    });
  }


  async createDir(path: StoragePath, remoteIdentity: ContentIdentity | undefined): Promise<void> {
    await httpRequest(`api/storages/${ this.storageName }/sync/create-dir`, {
      method: "post",
      prefixUrl: this.server,
      credentials: "include",
      headers: {
        "content-type": "application/bson"
      },
      body: bson.serialize({
        path: path.normalized,
        remoteIdentity
      })
    });
  }


  async remove(path: StoragePath, remoteIdentity: ContentIdentity): Promise<void> {
    await httpRequest(`api/storages/${ this.storageName }/sync/remove`, {
      method: "post",
      prefixUrl: this.server,
      credentials: "include",
      headers: {
        "content-type": "application/bson"
      },
      body: bson.serialize({
        path: path.normalized,
        remoteIdentity
      })
    });
  }


  async read(path: StoragePath): Promise<Buffer> {
    const r = await httpRequest(`api/storages/${ this.storageName }/sync/read`, {
      prefixUrl: this.server,
      credentials: "include",
      searchParams: {
        path: path.normalized
      }
    });

    return Buffer.from(await r.arrayBuffer());
  }
}
