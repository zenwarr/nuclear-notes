import { useEffect, useLayoutEffect, useRef } from "react";
import { DocumentManager } from "../DocumentManager";
import { MonacoEditorStateAdapter } from "./MonacoEditorStateAdapter";
import { Document } from "../Document";
import * as monaco from "monaco-editor";
import { useCurrentThemeIsDark } from "../Theme";


export interface MonacoEditorProps {
  doc: Document;
  className?: string;
}


function getLanguageFromFileName(filename: string) {
  const ext = filename.split(".").pop();
  if (ext === "ts" || ext === "tsx") {
    return "typescript";
  } else if (ext === "js" || ext === "jsx") {
    return "javascript";
  } else if (ext === "json") {
    return "json";
  } else {
    return "plaintext";
  }
}


export function MonacoEditor(props: MonacoEditorProps) {
  const containerRef = useRef<any>();
  const stateAdapter = useRef<MonacoEditorStateAdapter>(props.doc.getEditorStateAdapter() as MonacoEditorStateAdapter);
  const isDarkTheme = useCurrentThemeIsDark();

  useEffect(() => {
    monaco.editor.setTheme(isDarkTheme ? "vs-dark" : "vs");
    const editor = monaco.editor.create(containerRef.current, {
      value: stateAdapter.current.initialText,
      language: getLanguageFromFileName(props.doc.entryPath.normalized),
      wordWrap: "on",
      renderWhitespace: "all"
    });
    stateAdapter.current.model = editor.getModel();

    return () => {
      DocumentManager.instance.close(props.doc.entryPath);
    };
  }, []);

  useLayoutEffect(() => {
    monaco.editor.setTheme(isDarkTheme ? "vs-dark" : "vs");
  }, [ isDarkTheme ]);

  return <div ref={ containerRef } className={ props.className }/>;
}