import { execFile } from "node:child_process";
import { join, win32 } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { playWav } from "./voicevox.js";
import { watchSpeechReady } from "./speechReady.js";

export const voiceScript = String.raw`$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
$data=ConvertFrom-Json ([Console]::In.ReadToEnd())
Add-Type -AssemblyName System.Speech
$speaker=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
 $voice=$speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'ja-*' } | Select-Object -First 1
 if($null -ne $voice){$speaker.SelectVoice($voice.VoiceInfo.Name)}
 $stream=[System.IO.MemoryStream]::new()
 $speaker.SetOutputToWaveStream($stream)
 $speaker.Speak([string]$data.text)
 $speaker.SetOutputToNull()
 $stream.Position=0
 $player=[System.Media.SoundPlayer]::new($stream)
 try {
  $player.Load()
  [Console]::Out.WriteLine('SODA_VOICE_READY');[Console]::Out.Flush()
  $player.PlaySync()
 } finally { $player.Dispose();$stream.Dispose() }
} finally { $speaker.Dispose() }`;
export type Speak = (text: string, signal: AbortSignal, started?: () => void) => Promise<void>;
/** Fixed OS commands only; utterances are stdin data and never shell source. */
export function nativeSpeak(platform = process.platform, run: typeof execFile = execFile): Speak {
  if (platform === "darwin") return async (text, signal, started) => {
    signal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), "soda-native-voice-"));
    try {
      const file = join(directory, "voice.wav");
      await new Promise<void>((resolve, reject) => {
        const child = run("/usr/bin/say", ["-o", file, "--file-format=WAVE", "--data-format=LEI16@22050"],
          { windowsHide: true, signal, timeout: 60_000, maxBuffer: 2048 }, error => {
            const finish = () => error ? reject(Error("OS音声を生成できません。")) : resolve();
            if (signal.aborted && child.exitCode === null && child.signalCode === null) child.once("close", finish);
            else finish();
          });
        child.stdin?.on("error", () => {});child.stdin?.end(text);
      });
      signal.throwIfAborted();
      await playWav(await readFile(file), signal, "darwin", run, started);
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
  return (text, signal, started) =>
    new Promise((resolve, reject) => {
      if (platform !== "win32") {
        reject(Error("このOSの自動ボイスにはまだ対応していません。"));
        return;
      }
      const command = win32.join(
        process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
      );
      const args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
        Buffer.from(voiceScript, "utf16le").toString("base64")];
      const child = run(
        command,
        args,
        { windowsHide: true, signal, timeout: 60_000, maxBuffer: 2048 },
        (error) => {
          const finish = () =>
            error
              ? reject(Error("読み上げできません。OSの音声と出力先を確認してください。"))
              : resolve();
          if (signal.aborted && child.exitCode === null && child.signalCode === null)
            child.once("close", finish);
          else finish();
        },
      );
      watchSpeechReady(child, signal, started);
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ text }));
    });
}
export interface VoiceState {
  revision: number;
  enabled: boolean;
  speaking: boolean;
  message: string;
}
/** One OS speech process; keep only the newest pending utterance, never replay a backlog. */
export class AssistantVoice {
  private state: VoiceState = {
    revision: 0,
    enabled: false,
    speaking: false,
    message: "ボイスはオフです。",
  };
  private active: AbortController | null = null;
  private pending: { text: string; valid: () => boolean; speak?:Speak; ready?:()=>void } | null = null;
  private activeValid: (() => boolean) | null = null;
  private activeReady: (() => void) | null = null;
  private seen = new Set<string>();
  constructor(
    private readonly speak: Speak,
    private readonly changed: (state: VoiceState) => void = () => {},
  ) {}
  snapshot(): VoiceState {
    return { ...this.state };
  }
  configure(enabled: boolean): void {
    if (this.state.enabled === enabled) return;
    this.state.enabled = enabled;
    if (!enabled) this.stop();
    this.state.message = enabled
      ? "通知と新しい返答を、設定した音声で読み上げます。"
      : "ボイスはオフです。";
    this.publish();
  }
  say(key: string, text: string, valid: () => boolean = () => true, speak?:Speak, ready?:()=>void): void {
    if (this.seen.has(key)) { ready?.(); return; }
    this.seen.add(key);
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    if (!this.state.enabled || !valid()) { ready?.(); return; }
    // Keep text understandable without reading long Markdown/code blocks aloud.
    const value = text
      .replace(/\([a-f0-9]{8}\)/g, "")
      .replace(/```[\s\S]*?```/g, " コードは画面で確認してください。 ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[\u0000-\u001f\u007f-\u009f*#`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
    if (!value) { ready?.(); return; }
    this.pending?.ready?.();
    this.pending = { text: value, valid, ...(ready?{ready}:{}), ...(speak?{speak}:{}) };
    this.pump();
  }
  stop(): void {
    const pending = this.pending;
    this.pending = null;
    this.active?.abort();
    this.state.speaking = false;
    this.activeReady?.();
    pending?.ready?.();
    this.state.message = this.state.enabled ? "読み上げを停止しました。" : "ボイスはオフです。";
    this.publish();
  }
  validate(): void {
    if (this.pending && !this.pending.valid()) { this.pending.ready?.(); this.pending = null; }
    if (this.activeValid && !this.activeValid()) { this.active?.abort(); this.activeReady?.(); }
  }
  private pump(): void {
    if (this.active || !this.pending || !this.state.enabled) return;
    const pending = this.pending;
    this.pending = null;
    if (!pending.valid()) { pending.ready?.(); return; }
    const controller = new AbortController(),
      text = pending.text;
    this.activeValid = pending.valid;
    this.active = controller;
    this.state.speaking = false;
    this.state.message = "読み上げを準備しています。";
    this.publish();
    let announced = false;
    const announce = () => { if (!announced) { announced = true; pending.ready?.(); } };
    this.activeReady = announce;
    const started = () => {
      if (controller.signal.aborted || this.active !== controller) return;
      if (!pending.valid()) { controller.abort(); return; }
      this.state.speaking = true;
      this.state.message = "読み上げています。";
      this.publish();
      announce();
    };
    let playback: Promise<void>;
    try { playback = (pending.speak??this.speak)(text, controller.signal, started); }
    catch (error) { playback = Promise.reject(error); }
    void playback
      .catch((error:unknown) => {
        if (!controller.signal.aborted) {
          if (pending.valid()) announce();
          this.state.message = "読み上げできません。" + (error instanceof Error ? error.message.slice(0,180) : "音声と出力先を確認してください。");
        }
      })
      .finally(() => {
        if (this.active !== controller) return;
        this.active = null;
        this.activeValid = null;
        this.activeReady = null;
        this.state.speaking = false;
        if (!controller.signal.aborted && this.state.message === "読み上げています。")
          this.state.message = "読み上げが終わりました。";
        this.publish();
        this.pump();
      });
  }
  private publish(): void {
    ++this.state.revision;
    this.changed(this.snapshot());
  }
}

/** Baseline each conversation before announcing newly completed assistant messages. */
export class VoiceConversation {
  private scope = "";
  private warmed = false;
  private seen = new Set<string>();
  observe(state: {
    connected: boolean;
    conversationSessionId?: string | null;
    conversationCaughtUp?: boolean;
    session: { agent: { instanceId: string; state: string } | null; state: string } | null;
    messages: readonly { id: string; role: string; text: string }[];
  }): { key: string; text: string } | null {
    const actor = state.session?.agent;
    if (
      !state.connected ||
      state.session?.state !== "ready" ||
      !actor ||
      !state.conversationSessionId
    )
      return null;
    const scope = `${actor.instanceId}:${state.conversationSessionId}`;
    if (this.scope !== scope) {
      this.scope = scope;
      this.seen = new Set();
      this.warmed = false;
    }
    if (!this.warmed) {
      this.seen = new Set(state.messages.map((m) => m.id));
      this.warmed = state.conversationCaughtUp === true;
      return null;
    }
    if (state.conversationCaughtUp !== true) return null;
    if (actor.state !== "idle") return null;
    const fresh = state.messages.filter((m) => !this.seen.has(m.id) && m.role === "assistant");
    for (const m of state.messages) this.seen.add(m.id);
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    const latest = fresh.at(-1);
    return latest ? { key: `reply:${scope}:${latest.id}`, text: latest.text } : null;
  }
}
