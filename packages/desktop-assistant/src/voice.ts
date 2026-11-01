import { execFile } from "node:child_process";
import { win32 } from "node:path";

export const voiceScript = String.raw`$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
$data=ConvertFrom-Json ([Console]::In.ReadToEnd())
Add-Type -AssemblyName System.Speech
$speaker=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
 $voice=$speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'ja-*' } | Select-Object -First 1
 if($null -ne $voice){$speaker.SelectVoice($voice.VoiceInfo.Name)}
 $speaker.SetOutputToDefaultAudioDevice()
 $speaker.Speak([string]$data.text)
} finally { $speaker.Dispose() }`;
export type Speak = (text: string, signal: AbortSignal) => Promise<void>;
/** Fixed OS commands only; utterances are stdin data and never shell source. */
export function nativeSpeak(platform = process.platform, run: typeof execFile = execFile): Speak {
  return (text, signal) =>
    new Promise((resolve, reject) => {
      if (platform !== "win32" && platform !== "darwin") {
        reject(Error("このOSの自動ボイスにはまだ対応していません。"));
        return;
      }
      const command =
        platform === "win32"
          ? win32.join(
              process.env.SystemRoot || "C:\\Windows",
              "System32",
              "WindowsPowerShell",
              "v1.0",
              "powershell.exe",
            )
          : "/usr/bin/say";
      const args =
        platform === "win32"
          ? [
              "-NoLogo",
              "-NoProfile",
              "-NonInteractive",
              "-EncodedCommand",
              Buffer.from(voiceScript, "utf16le").toString("base64"),
            ]
          : [];
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
      child.stdin?.on("error", () => {});
      child.stdin?.end(platform === "win32" ? JSON.stringify({ text }) : text);
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
  private pending: { text: string; valid: () => boolean; speak?:Speak } | null = null;
  private activeValid: (() => boolean) | null = null;
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
  say(key: string, text: string, valid: () => boolean = () => true, speak?:Speak): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    if (!this.state.enabled || !valid()) return;
    // Keep text understandable without reading long Markdown/code blocks aloud.
    const value = text
      .replace(/\([a-f0-9]{8}\)/g, "")
      .replace(/```[\s\S]*?```/g, " コードは画面で確認してください。 ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[\u0000-\u001f\u007f-\u009f*#`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
    if (!value) return;
    this.pending = { text: value, valid, ...(speak?{speak}:{}) };
    this.pump();
  }
  stop(): void {
    this.pending = null;
    this.active?.abort();
    this.state.message = this.state.enabled ? "読み上げを停止しました。" : "ボイスはオフです。";
    this.publish();
  }
  validate(): void {
    if (this.pending && !this.pending.valid()) this.pending = null;
    if (this.activeValid && !this.activeValid()) this.active?.abort();
  }
  private pump(): void {
    if (this.active || !this.pending || !this.state.enabled) return;
    const pending = this.pending;
    this.pending = null;
    if (!pending.valid()) return;
    const controller = new AbortController(),
      text = pending.text;
    this.activeValid = pending.valid;
    this.active = controller;
    this.state.speaking = true;
    this.state.message = "読み上げています。";
    this.publish();
    void (pending.speak??this.speak)(text, controller.signal)
      .catch((error:unknown) => {
        if (!controller.signal.aborted) {
          this.pending = null;
          this.state.message = "読み上げできません。" + (error instanceof Error ? error.message.slice(0,180) : "音声と出力先を確認してください。");
        }
      })
      .finally(() => {
        if (this.active !== controller) return;
        this.active = null;
        this.activeValid = null;
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
