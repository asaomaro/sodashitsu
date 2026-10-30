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
    conversation: () => ipcRenderer.invoke("assistant:conversation"),
    startSession: (input: unknown) => ipcRenderer.invoke("assistant:start-session", input),
    adoptSession: (input: unknown) => ipcRenderer.invoke("assistant:adopt-session", input),
    sendMessage: (input: unknown) => ipcRenderer.invoke("assistant:send-message", input),
    onConversation: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:conversation-changed", receive);
      return () => ipcRenderer.removeListener("assistant:conversation-changed", receive);
    },
    inbox: () => ipcRenderer.invoke("assistant:inbox"),
    onInbox: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:inbox-changed", receive);
      return () => ipcRenderer.removeListener("assistant:inbox-changed", receive);
    },
  }),
);
