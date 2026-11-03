import { contextBridge, ipcRenderer } from "electron";

// Fixed channels only. No raw IPC, shell, filesystem, token or terminal-writing primitive.
contextBridge.exposeInMainWorld(
  "assistant",
  Object.freeze({
    openTools:()=>ipcRenderer.invoke("assistant:tools-open"),
    consumeDraft:(input:unknown)=>ipcRenderer.invoke("assistant:draft-consume",input),
    draftState:()=>ipcRenderer.invoke("assistant:draft-state"),
    draftMessage:(input:unknown)=>ipcRenderer.invoke("assistant:draft-message",input),
    onDraft:(callback:(state:unknown)=>void)=>{const receive=(_event:unknown,state:unknown)=>callback(state);ipcRenderer.on("assistant:draft-changed",receive);return()=>ipcRenderer.removeListener("assistant:draft-changed",receive);},
    appearanceState:()=>ipcRenderer.invoke("assistant:appearance-state"),
    onAppearance:(callback:(state:unknown)=>void)=>{const receive=(_event:unknown,state:unknown)=>callback(state);ipcRenderer.on("assistant:appearance-changed",receive);return()=>ipcRenderer.removeListener("assistant:appearance-changed",receive);},
    read: () => ipcRenderer.invoke("assistant:read"),
    save: (preferences: unknown) => ipcRenderer.invoke("assistant:save", preferences),
    open: () => ipcRenderer.invoke("assistant:open"),
    settings: () => ipcRenderer.invoke("assistant:settings"),
    chat: () => ipcRenderer.invoke("assistant:chat"),
    refreshNotificationSummary:()=>ipcRenderer.invoke("assistant:notification-summary-refresh"),
    openAgent:(input:unknown)=>ipcRenderer.invoke("assistant:agent-open",input),
    agentModels:(input:unknown)=>ipcRenderer.invoke("assistant:agent-models",input),
    chooseCaptain:(input:unknown)=>ipcRenderer.invoke("assistant:captain-choice",input),
    windowState:()=>ipcRenderer.invoke("assistant:window-state"),
    onWindowState:(callback:(state:unknown)=>void)=>{const receive=(_event:unknown,state:unknown)=>callback(state);ipcRenderer.on("assistant:window-state-changed",receive);return()=>ipcRenderer.removeListener("assistant:window-state-changed",receive);},
    windowResize: (input: unknown) => ipcRenderer.invoke("assistant:window-resize", input),
    windowAction: (action: unknown) => ipcRenderer.invoke("assistant:window-action", action),
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
    apps: () => ipcRenderer.invoke("assistant:apps"),
    openApp: (input: unknown) => ipcRenderer.invoke("assistant:app-open", input),
    callApp: (input: unknown) => ipcRenderer.invoke("assistant:app-call", input),
    displays: () => ipcRenderer.invoke("assistant:display-list"),
    characterActor: () => ipcRenderer.invoke("assistant:character-actor"),
    characterState: () => ipcRenderer.invoke("assistant:character-state"),
    onCharacterState: (callback: (state: unknown) => void) => {
      const receive=(_event:unknown,state:unknown)=>callback(state);
      ipcRenderer.on("assistant:character-state-changed",receive);
      return ()=>ipcRenderer.removeListener("assistant:character-state-changed",receive);
    },
    characterInfo: () => ipcRenderer.invoke("assistant:character-info"),
    characters: () => ipcRenderer.invoke("assistant:character-list"),
    previewYukkuriCharacters: () => ipcRenderer.invoke("assistant:yukkuri-characters-preview"),
    previewCharacterPack: () => ipcRenderer.invoke("assistant:character-pack-preview"),
    importCharacterPack: (input: unknown) =>
      ipcRenderer.invoke("assistant:character-pack-import", input),
    removeCharacterPack: (input: unknown) =>
      ipcRenderer.invoke("assistant:character-pack-remove", input),
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
    readNotice: (input: unknown) => ipcRenderer.invoke("assistant:notice-read", input),
    openSource: (input: unknown) => ipcRenderer.invoke("assistant:source-open", input),
    replySource: (input: unknown) => ipcRenderer.invoke("assistant:source-reply", input),
    sourceKey: (input: unknown) => ipcRenderer.invoke("assistant:source-key", input),
    openSession: () => ipcRenderer.invoke("assistant:session-open"),
    ocrState: () => ipcRenderer.invoke("assistant:ocr-state"),
    ocrUpload:(input:unknown)=>ipcRenderer.invoke("assistant:ocr-upload",input),
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
    transcribeUpload:(input:unknown)=>ipcRenderer.invoke("assistant:transcribe-upload",input),
    transcribeFile: () => ipcRenderer.invoke("assistant:transcribe-file"),
    cancelTranscription: () => ipcRenderer.invoke("assistant:transcribe-cancel"),
    readClipboard: () => ipcRenderer.invoke("assistant:clipboard-read"),
    writeClipboard: (input: unknown) => ipcRenderer.invoke("assistant:clipboard-write", input),
    onTools: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:tools-changed", receive);
      return () => ipcRenderer.removeListener("assistant:tools-changed", receive);
    },
    beginResize: (input: unknown) => ipcRenderer.invoke("assistant:resize-start", input),
    resize: (input: unknown) => ipcRenderer.invoke("assistant:resize-move", input),
    endResize: (input: unknown) => ipcRenderer.invoke("assistant:resize-end", input),
    voiceSpeakers: (input: unknown) => ipcRenderer.invoke("assistant:voice-speakers", input),
    voiceState: () => ipcRenderer.invoke("assistant:voice-state"),
    stopVoice: () => ipcRenderer.invoke("assistant:voice-stop"),
    testVoice: (input?:unknown) => ipcRenderer.invoke("assistant:voice-test",input),
    voiceVersions:()=>ipcRenderer.invoke("assistant:voice-versions"),
    matchVoice: (input:unknown)=>ipcRenderer.invoke("assistant:voice-match",input),
    onVoice: (callback: (state: unknown) => void) => {
      const receive=(_event:unknown,state:unknown)=>callback(state);
      ipcRenderer.on("assistant:voice-changed",receive);
      return ()=>ipcRenderer.removeListener("assistant:voice-changed",receive);
    },
    sizeNotice: (input: unknown) => ipcRenderer.invoke("assistant:notice-size",input),
    noticeState: () => ipcRenderer.invoke("assistant:notice-state"),
    dismissNotice: (input: unknown) => ipcRenderer.invoke("assistant:notice-dismiss",input),
    openNotice: (input: unknown) => ipcRenderer.invoke("assistant:notice-open",input),
    onNotice: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:notice-changed", receive);
      return () => ipcRenderer.removeListener("assistant:notice-changed", receive);
    },
    inbox: () => ipcRenderer.invoke("assistant:inbox"),
    onInbox: (callback: (state: unknown) => void) => {
      const receive = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on("assistant:inbox-changed", receive);
      return () => ipcRenderer.removeListener("assistant:inbox-changed", receive);
    },
  }),
);
