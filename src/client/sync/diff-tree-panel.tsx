import { Button, Stack } from "@mui/material";
import { StoragePath } from "@storage/storage-path";
import { SyncDiffEntry } from "@sync/sync-diff-entry";
import { isConflictingDiff } from "@sync/sync-diff-type";
import { DiffAction } from "@sync/sync-metadata-storage";
import { useState } from "react";
import { Workspace } from "../workspace/workspace";
import { FullScreenDialog } from "../utils/full-screen-dialog";
import { DiffCompareLoader } from "./diff-compare-loader";


export type DiffTreePanelProps = {
  allDiffs: SyncDiffEntry[];
  selectedPath: StoragePath | undefined;
}


export function DiffTreePanel(props: DiffTreePanelProps) {
  const isDisabled = props.selectedPath == null;
  const [ diffModalActive, setDiffModalActive ] = useState(false);
  const d = props.allDiffs.find(d => props.selectedPath && d.path.isEqual(props.selectedPath));
  const isConflict = d != null && isConflictingDiff(d.type);

  async function accept() {
    if (!props.selectedPath) {
      return;
    }

    await Workspace.instance.acceptChangeTree(props.selectedPath, props.allDiffs);
  }

  async function resolve(action: DiffAction) {
    if (!props.selectedPath || !d) {
      return;
    }

    setDiffModalActive(false);
    await Workspace.instance.acceptChanges(d, action);
  }

  return <>
    <Stack spacing={ 2 } direction={ "row" }>
      {
        !isConflict && <Button variant={ "outlined" } size={ "small" } disabled={ isDisabled } onClick={ () => accept() }>
          Accept non-conflicting
        </Button>
      }

      {
          isConflict && <>
          <Button variant={ "outlined" } size={ "small" } disabled={ isDisabled } onClick={ () => resolve(DiffAction.AcceptLocal) }>
            Accept local
          </Button>

          <Button variant={ "outlined" } size={ "small" } disabled={ isDisabled } onClick={ () => resolve(DiffAction.AcceptRemote) }>
            Accept remote
          </Button>
        </>
      }

      <Button variant={ "outlined" } size={ "small" } disabled={ isDisabled } onClick={ () => setDiffModalActive(true) }>
        Show diff
      </Button>
    </Stack>

    <FullScreenDialog title={ `Diff: ${ props.selectedPath?.normalized }` } open={ diffModalActive }
                      onClose={ () => setDiffModalActive(false) }>
      <DiffCompareLoader path={ props.selectedPath } diffType={ d?.type }
                         onAcceptLocal={ () => resolve(DiffAction.AcceptLocal) }
                         onAcceptRemote={ () => resolve(DiffAction.AcceptRemote) }/>
    </FullScreenDialog>
  </>;
}
