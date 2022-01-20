import ky from "ky";
import { timeout } from "./timeout";


export class PluginBackend {
  async clone(workspaceId: string, name: string, url: string): Promise<void> {
    await ky.post(`/api/workspaces/${ encodeURIComponent(workspaceId) }/plugins`, {
      json: {
        name, url
      }
    });
  }


  async update(workspaceId: string, pluginId: string): Promise<void> {
    await ky.post(`/api/workspaces/${ encodeURIComponent(workspaceId) }/plugins/${pluginId}/update`);
  }
}


export class TestPluginBackend {
  async clone(workspaceId: string, name: string, url: string): Promise<void> {
    await timeout(3000);
    console.log("clone plugin");
  }

  async update(workspaceId: string, pluginId: string): Promise<void> {
    await timeout(3000);
    console.log("update plugin");
  }
}