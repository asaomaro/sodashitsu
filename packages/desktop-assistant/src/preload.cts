import { contextBridge, ipcRenderer } from "electron";

// Fixed channels only. No raw IPC, shell, filesystem, token or terminal-writing primitive.
contextBridge.exposeInMainWorld(
  "assistant",
  Object.freeze({
    read: () => ipcRenderer.invoke("assistant:read"),
    save: (preferences: unknown) => ipcRenderer.invoke("assistant:save", preferences),
    open: () => ipcRenderer.invoke("assistant:open"),
    settings: () => ipcRenderer.invoke("assistant:settings"),
    chat: () => ipcRenderer.invoke("assistant:chat"),
    hide: () => ipcRenderer.invoke("assistant:hide"),
    inbox: () => ipcRenderer.invoke("assistant:inbox"),
    onInbox: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:inbox-changed", receive);
      return () => ipcRenderer.removeListener("assistant:inbox-changed", receive);
    },
  }),
);
