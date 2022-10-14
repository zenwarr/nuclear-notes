import { SpecialPath } from "@storage/special-path";
import { StoragePath } from "@storage/storage-path";
import { WorkspaceSettingsProvider } from "@storage/workspace-settings-provider";
import { Mutex } from "async-mutex";
import * as _ from "lodash";
import { FileSettings } from "@common/Settings";
import { Workspace } from "../workspace/workspace";
import { StorageEntryPointer } from "@storage/entry-storage";
import { DocumentEditorProvider } from "./DocumentEditorProvider";


export interface DocumentEditorStateAdapter {
  serializeContent(): string | Buffer | Promise<string | Buffer>;
}


export type DocumentEditorStateAdapterConstructor = new(doc: Document, initialContent: Buffer, settings: FileSettings) => DocumentEditorStateAdapter;


export class Document {
  constructor(entry: StorageEntryPointer) {
    this.entry = entry;
    this.onChangesDebounced = _.debounce(this.save.bind(this), 500);
  }


  async close() {
    const release = await Document.docsLock.acquire();

    try {
      await this.save();
      Document.docs.delete(this.entry.path.normalized);
    } finally {
      release();
    }
  }


  setEditorStateAdapter(adapter: DocumentEditorStateAdapter) {
    this.adapter = adapter;
  }


  getEditorStateAdapter() {
    return this.adapter;
  }


  async contentToBuffer(): Promise<Buffer> {
    if (!this.adapter) {
      throw new Error("Invariant error: state adapter was not property initialized");
    }

    const adapterData = await this.adapter.serializeContent();
    return typeof adapterData === "string" ? Buffer.from(adapterData) : adapterData;
  }


  onChanges() {
    ++this.unsavedChangesCounter;
    this.onChangesDebounced()?.catch(error => console.error("onChanges failed", error));
  }


  private async save() {
    if (this.justDeleted || this.unsavedChangesCounter === 0) {
      return;
    }

    const release = await this.saveLock.acquire();
    try {
      const prevUnsavedChanges = this.unsavedChangesCounter;

      let buf = await this.contentToBuffer();
      await this.entry.writeOrCreate(buf);
      Workspace.instance.scheduleDiffUpdate(this.entry.path);

      if (this.entry.path.isEqual(SpecialPath.Settings)) {
        await WorkspaceSettingsProvider.instance.reload(buf);
      }

      this.unsavedChangesCounter -= prevUnsavedChanges;
    } finally {
      release();
    }
  }


  static async create(ep: StorageEntryPointer): Promise<Document> {
    const release = await this.docsLock.acquire();

    try {
      const document = new Document(ep);
      const content = await ep.read();

      const editorProvider = new DocumentEditorProvider(Workspace.instance.plugins);
      const settings = WorkspaceSettingsProvider.instance.getSettingsForPath(ep.path);
      document.setEditorStateAdapter(await editorProvider.getStateAdapter(document, content, settings.editor));

      this.docs.set(ep.path.normalized, document);

      return document;
    } finally {
      release();
    }
  }


  /**
   * This method should only be called by Workspace before entries are deleted.
   */
  static async onRemove(path: StoragePath) {
    const release = await this.docsLock.acquire();
    try {
      for (const doc of this.docs.values()) {
        const docPath = doc.entry.path;
        if (docPath.inside(path)) {
          doc.justDeleted = true;
        }
      }
    } finally {
      release();
    }
  }


  private onChangesDebounced: () => Promise<void> | undefined;
  readonly entry: StorageEntryPointer;

  /**
   * This property is set to true when a file is intentionally deleted by user.
   * This document should be closed immediately, but we should prevent saving the document after that.
   * A document is not going to be automatically saved on close in this case.
   */
  justDeleted = false;
  private unsavedChangesCounter = 0;
  private saveLock = new Mutex();

  private adapter: DocumentEditorStateAdapter | undefined;
  private static docs = new Map<string, Document>();
  private static docsLock = new Mutex();
}
