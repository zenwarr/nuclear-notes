import { StorageEntryData, walkStorageEntryData } from "@common/workspace/StorageEntryData";
import { StoragePath } from "@storage/StoragePath";
import * as mobx from "mobx-react-lite";
import { useMemo } from "react";
import { FixedSizeNodeData, FixedSizeTree, FixedSizeTreeProps } from "react-vtree";
import { ClientWorkspace } from "../ClientWorkspace";
import { TreeContext, TreeCtxData } from "../tree/TreeContext";
import { TreeNode } from "../tree/TreeNode";
import { TreeNodeData, TreeNodeDataBox } from "../tree/TreeNodeData";
import { useExpandedPaths } from "../tree/useExpandedPaths";


export type WorkspaceTreeProps = Omit<FixedSizeTreeProps<FixedSizeNodeData>, "treeWalker" | "children"> & {
  onMenuOpen?: (x: number, y: number, path: StoragePath) => void;
  onMenuClose?: () => void;
  onSelect?: (path: StoragePath) => void;
}


export const WorkspaceTree = mobx.observer((props: WorkspaceTreeProps) => {
  const cw = ClientWorkspace.instance;
  const root = cw.storage.getMemoryData(StoragePath.root);

  const roots = root?.children?.length;
  if (!roots) {
    return <div>
      Empty workspace
    </div>;
  }

  const expand = useExpandedPaths(cw.selectedEntry?.normalized);

  // we need to touch all nodes to subscribe to their changes because FixedTreeSize is not a mobx observer
  for (const _ of walkStorageEntryData(root)) {
  }

  const treeCtx = useMemo<TreeCtxData>(() => ({
    openMenu: (x: number, y: number, id: string) => props.onMenuOpen?.(x, y, new StoragePath(id)),
    selected: cw.selectedEntry?.normalized,
    onSelect: (id: string) => {
      const selected = cw.storage.getMemoryData(new StoragePath(id));
      if (!selected) {
        return;
      }

      cw.selectedEntry = new StoragePath(id);
      const isDir = selected.stats.isDirectory;

      if (!isDir) {
        props.onSelect?.(new StoragePath(id));
      } else {
        expand.onToggle(id);
      }
    },
    expanded: expand.expanded
  }), [ props.onMenuOpen, props.onMenuClose ]);

  return <TreeContext.Provider value={ treeCtx }>
    <FixedSizeTree { ...props } itemSize={ 25 } treeWalker={ workspaceTreeWalker.bind(null, root, expand.expanded) as any }>
      { TreeNode }
    </FixedSizeTree>
  </TreeContext.Provider>;
});


export function* workspaceTreeWalker(root: StorageEntryData, expanded: string[]):
    Generator<TreeNodeDataBox<StorageEntryData> | undefined, undefined, TreeNodeDataBox<StorageEntryData>> {
  function createEntry(e: StorageEntryData, level: number): TreeNodeDataBox<StorageEntryData> {
    return {
      data: {
        id: e.path.normalized,
        isOpenByDefault: expanded.includes(e.path.normalized),
        isDir: e.stats.isDirectory,
        content: e.path.basename,
        level,
        extra: e
      }
    };
  }

  const roots = root.children || [];
  if (!roots.length) {
    return;
  }

  for (const child of roots) {
    yield createEntry(child, 0);
  }

  while (true) {
    let yielded = yield;

    for (const child of yielded.data.extra.children || []) {
      yield createEntry(child, yielded.data.level + 1);
    }
  }
}
