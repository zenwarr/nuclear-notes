import * as React from "react";
import { useEffect, useState } from "react";
import { Workspace } from "../workspace/workspace";
import { Palette, PaletteCompleter } from "./palette";
import { filePaletteCompleter } from "./palette-completer";
import { CommandManager, commandPaletteCompleter } from "../commands/command-manager";
import { StoragePath } from "@storage/storage-path";


export enum PaletteMode {
  File,
  Command
}


let togglePaletteCb: ((mode: PaletteMode) => void) | undefined = undefined;


export function PaletteProvider(props: React.PropsWithChildren<{}>) {
  const [ mode, setMode ] = useState<PaletteMode | undefined>(undefined);

  useEffect(() => {
    togglePaletteCb = (newMode: PaletteMode) => {
      if (mode != null) {
        setMode(undefined);
      } else {
        setMode(newMode);
      }
    };

    return () => {
      togglePaletteCb = undefined;
    };
  }, [ mode ]);

  function onSelect(value: string) {
    if (mode === PaletteMode.File) {
      Workspace.instance.navigateToPath(new StoragePath(value));
    } else if (mode === PaletteMode.Command) {
      CommandManager.instance.run(value);
    }

    setMode(undefined);
  }

  let completer: PaletteCompleter | undefined;
  if (mode != null) {
    completer = mode === PaletteMode.File ? filePaletteCompleter : commandPaletteCompleter;
  }

  return <div>
    <Palette open={ mode != null } onClose={ () => setMode(undefined) }
             completer={ completer } onSelect={ onSelect }/>

    {
      props.children
    }
  </div>;
}


export function togglePalette(mode: PaletteMode) {
  togglePaletteCb?.(mode);
}
