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
    beginRecording: () => ipcRenderer.invoke("assistant:record-start"),
    stopRecording: (input: unknown) => ipcRenderer.invoke("assistant:record-stop", input),
    discardRecording: (input: unknown) => ipcRenderer.invoke("assistant:record-discard", input),
    transcribeRecording: (input: unknown) =>
      ipcRenderer.invoke("assistant:record-transcribe", input),
    onRecordingCancelled: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:recording-cancelled", receive);
      return () => ipcRenderer.removeListener("assistant:recording-cancelled", receive);
    },
    screenshotSources: () => ipcRenderer.invoke("assistant:screenshot-sources"),
    approveScreenshot: (input: unknown) =>
      ipcRenderer.invoke("assistant:screenshot-approve", input),
    submitScreenshot: (input: unknown) => ipcRenderer.invoke("assistant:screenshot-submit", input),
    cancelScreenshot: (input: unknown) => ipcRenderer.invoke("assistant:screenshot-cancel", input),
    reminders: () => ipcRenderer.invoke("assistant:reminders"),
    saveReminder: (input: unknown) => ipcRenderer.invoke("assistant:reminder-save", input),
    removeReminder: (input: unknown) => ipcRenderer.invoke("assistant:reminder-remove", input),
    acknowledgeReminder: (input: unknown) => ipcRenderer.invoke("assistant:reminder-ack", input),
    onReminders: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:reminders-changed", receive);
      return () => ipcRenderer.removeListener("assistant:reminders-changed", receive);
    },
    openSource: (input: unknown) => ipcRenderer.invoke("assistant:source-open", input),
    replySource: (input: unknown) => ipcRenderer.invoke("assistant:source-reply", input),
    sourceKey: (input: unknown) => ipcRenderer.invoke("assistant:source-key", input),
    openSession: () => ipcRenderer.invoke("assistant:session-open"),
    ocrState: () => ipcRenderer.invoke("assistant:ocr-state"),
    ocrFile: () => ipcRenderer.invoke("assistant:ocr-file"),
    ocrClipboard: () => ipcRenderer.invoke("assistant:ocr-clipboard"),
    ocrCrop: (input: unknown) => ipcRenderer.invoke("assistant:ocr-crop", input),
    ocrRun: (input: unknown) => ipcRenderer.invoke("assistant:ocr-run", input),
    ocrDiscard: () => ipcRenderer.invoke("assistant:ocr-discard"),
    onOcr: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:ocr-changed", receive);
      return () => ipcRenderer.removeListener("assistant:ocr-changed", receive);
    },
    tools: () => ipcRenderer.invoke("assistant:tools"),
    saveNote: (input: unknown) => ipcRenderer.invoke("assistant:note-save", input),
    deleteNote: (input: unknown) => ipcRenderer.invoke("assistant:note-delete", input),
    transcribeFile: () => ipcRenderer.invoke("assistant:transcribe-file"),
    cancelTranscription: () => ipcRenderer.invoke("assistant:transcribe-cancel"),
    readClipboard: () => ipcRenderer.invoke("assistant:clipboard-read"),
    writeClipboard: (input: unknown) => ipcRenderer.invoke("assistant:clipboard-write", input),
    onTools: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:tools-changed", receive);
      return () => ipcRenderer.removeListener("assistant:tools-changed", receive);
    },
    inbox: () => ipcRenderer.invoke("assistant:inbox"),
    onInbox: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:inbox-changed", receive);
      return () => ipcRenderer.removeListener("assistant:inbox-changed", receive);
    },
  }),
);
