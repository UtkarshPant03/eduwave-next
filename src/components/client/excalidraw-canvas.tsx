"use client";

// Fonts are served from /public (copied on install), not from a CDN.
if (typeof window !== "undefined") {
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
}

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useState } from "react";

export type Scene = { elements: unknown[]; files?: Record<string, unknown> };

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setDark(t ? t === "dark" : mq.matches);
    };
    read();
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  return dark;
}

export default function ExcalidrawCanvas({
  initialScene,
  readOnly,
  onSceneChange,
}: {
  initialScene: Scene;
  readOnly: boolean;
  onSceneChange: (scene: Scene, version: number) => void;
}) {
  const dark = useIsDark();
  return (
    <Excalidraw
      // Excalidraw's own types are stricter than our stored JSON; the data came from Excalidraw.
      initialData={{ elements: initialScene.elements as never, files: (initialScene.files ?? {}) as never, scrollToContent: true }}
      viewModeEnabled={readOnly}
      theme={dark ? "dark" : "light"}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } } }}
      onChange={(elements, _appState, files) => {
        // Sum of element versions changes only when the drawing itself changes.
        const version = elements.reduce((sum, el) => sum + el.version, elements.length);
        onSceneChange({ elements: elements.filter((el) => !el.isDeleted) as unknown[], files: files as Record<string, unknown> }, version);
      }}
    />
  );
}
