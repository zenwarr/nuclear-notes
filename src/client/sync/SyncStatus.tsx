import { Box, Button, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { ClientWorkspace } from "../ClientWorkspace";
import { SyncStatusIcon, SyncStatusIconColor } from "./SyncStatusIcon";
import { formatRelative } from "date-fns";


export interface SyncStatusProps {
  onClick?: () => void;
}


export const SyncStatus = observer((props: SyncStatusProps) => {
  const sync = ClientWorkspace.instance.syncWorker;
  const jobs = ClientWorkspace.instance.syncJobRunner;

  let color: SyncStatusIconColor = !jobs.errors.length ? "success" : "error";
  let syncDate = jobs.lastSuccessfulJobDone ? formatRelative(jobs.lastSuccessfulJobDone, new Date()) : "Unknown";
  const diffCount = sync.actualDiff.length;

  return <Tooltip title={ "Last sync: " + syncDate } placement={ "bottom-start" }>
    <Button onClick={ props.onClick }>
      <Box display={ "flex" }>
        <SyncStatusIcon color={ color } rotate={ jobs.runningJobs.length > 0 }/>

        &nbsp;

        <span>
          { diffCount > 0 ? diffCount : "" }
        </span>
      </Box>
    </Button>
  </Tooltip>;
});
