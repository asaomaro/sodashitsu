import { desktopAssistantTranscriptionOrigin as localTranscriptionOrigin } from "@sodashitsu/protocol";
import { open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, extname } from "node:path";
import { z } from "zod";

export const AUDIO_LIMIT = 25 * 1024 * 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const types: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};
export interface AudioFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}
export interface TranscriptionState {
  revision: number;
  status: "idle" | "selecting" | "transcribing" | "stopping" | "done" | "error";
  name: string;
  text: string;
  message: string;
}
export async function readAudioFile(
  path: string,
  signal?: AbortSignal,
  files: Pick<typeof import("node:fs/promises"), "open" | "lstat"> = { open, lstat },
): Promise<AudioFile> {
  const mime = types[extname(path).toLowerCase()];
  if (!mime) throw Error("WAV・MP3・M4A・MP4・OGG・FLAC・WebMの音声ファイルを選んでください。");
  signal?.throwIfAborted();
  const before = await files.lstat(path);
  signal?.throwIfAborted();
  if (!before.isFile() || before.isSymbolicLink() || before.size === 0 || before.size > AUDIO_LIMIT)
    throw Error("音声ファイルは空でない25MB以内の通常ファイルを選んでください。");
  // Nonblocking open also covers a regular path replaced by a FIFO between lstat/open.
  const file = await files.open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    signal?.throwIfAborted();
    const stat = await file.stat();
    signal?.throwIfAborted();
    if (!stat.isFile() || stat.size === 0 || stat.size > AUDIO_LIMIT)
      throw Error("音声ファイルは空でない25MB以内の通常ファイルを選んでください。");
    if (
      before.dev !== stat.dev ||
      before.ino !== stat.ino ||
      before.size !== stat.size ||
      before.mtimeMs !== stat.mtimeMs ||
      before.ctimeMs !== stat.ctimeMs
    )
      throw Error("選んだ音声ファイルが読み取り前に変更されました。");
    const buffer = Buffer.alloc(Math.min(AUDIO_LIMIT + 1, stat.size + 1));
    let used = 0;
    while (used < buffer.length) {
      signal?.throwIfAborted();
      const result = await file.read(buffer, used, buffer.length - used, null);
      signal?.throwIfAborted();
      if (!result.bytesRead) break;
      used += result.bytesRead;
    }
    if (used > stat.size || used > AUDIO_LIMIT)
      throw Error("選んだ音声ファイルが読み取り中に変更されました。");
    const after = await file.stat();
    signal?.throwIfAborted();
    if (
      after.dev !== stat.dev ||
      after.ino !== stat.ino ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs ||
      used !== stat.size
    )
      throw Error("選んだ音声ファイルが読み取り中に変更されました。");
    if (!used) throw Error("音声ファイルが空です。");
    return { name: basename(path).slice(0, 200), mime, bytes: buffer.subarray(0, used) };
  } finally {
    await file.close();
  }
}

export { desktopAssistantTranscriptionOrigin as localTranscriptionOrigin } from "@sodashitsu/protocol";

interface Options {
  pick(): Promise<string | null>;
  changed(state: TranscriptionState): void;
  read?: typeof readAudioFile;
  fetch?: typeof fetch;
  now?: () => number;
}
/** One explicit local job. Never automatically records, uploads, launches a model or retries. */
export class Transcription {
  private state: TranscriptionState = {
    revision: 0,
    status: "idle",
    name: "",
    text: "",
    message: "音声は自動で録音・送信しません。",
  };
  private origin = "http://127.0.0.1:8080";
  private enabled = false;
  private generation = 0;
  private active: AbortController | null = null;
  private inFlight = false;
  private currentKey: string | null = null;
  constructor(private readonly options: Options) {}
  snapshot(): TranscriptionState {
    return { ...this.state };
  }
  configure(enabled: boolean, origin: string): void {
    const next = localTranscriptionOrigin(origin);
    if (!enabled || this.origin !== next) this.cancel();
    this.enabled = enabled;
    this.origin = next;
  }
  cancel(expectedKey?: string): boolean {
    if (expectedKey !== undefined && this.currentKey !== expectedKey) return false;
    this.currentKey = null;
    ++this.generation;
    this.active?.abort();
    this.active = null;
    this.state = {
      ...this.state,
      status: this.inFlight ? "stopping" : "idle",
      name: "",
      text: "",
      message: this.inFlight
        ? "中止しています。ファイル選択中はダイアログも閉じてください。"
        : "文字起こしの送受信を中止しました。",
    };
    this.publish();
    return true;
  }
  isBusy(): boolean {
    return this.inFlight;
  }
  file(): Promise<void> {
    return this.process(async () => {
      const path = await this.options.pick();
      return path
        ? (signal: AbortSignal) => (this.options.read ?? readAudioFile)(path, signal)
        : null;
    });
  }
  recorded(audio: AudioFile, key: string): Promise<void> {
    if (
      !Object.values(types).includes(audio.mime.split(";")[0]!) ||
      !audio.bytes.byteLength ||
      audio.bytes.byteLength > AUDIO_LIMIT
    )
      throw Error("録音データの形式・容量を確認してください。");
    return this.process(async () => async () => audio, key);
  }
  private async process(
    select: () => Promise<((signal: AbortSignal) => Promise<AudioFile>) | null>,
    key: string | null = null,
  ): Promise<void> {
    if (!this.enabled)
      throw Error("設定でローカル文字起こしを有効にし、Whisperサーバを起動してください。");
    if (this.inFlight) throw Error("前の文字起こしを停止してから選んでください。");
    this.inFlight = true;
    this.currentKey = key;
    const generation = ++this.generation;
    const origin = this.origin;
    const controller = new AbortController();
    this.active = controller;
    const live = () => {
      if (generation !== this.generation || !this.enabled) return false;
      if (controller.signal.aborted) throw Error("文字起こしの制限時間を超えました。");
      return true;
    };
    this.state = {
      ...this.state,
      status: "selecting",
      name: "",
      text: "",
      message: key ? "録音データを確認しています。送信先はこのPCのWhisperです。" : "音声ファイルを選んでください。送信先はこのPCのWhisperです。",
    };
    this.publish();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const read = await select();
      if (!live()) return;
      if (!read) {
        this.cancel();
        return;
      }
      const now = () => this.options.now?.() ?? performance.now();
      const expires = now() + 300_000;
      timer = setTimeout(() => controller.abort(), 300_000);
      const audio = await read(controller.signal);
      if (!live()) return;
      if (!audio.bytes.byteLength || audio.bytes.byteLength > AUDIO_LIMIT)
        throw Error("音声データは25MB以内にしてください。");
      this.state = {
        ...this.state,
        status: "transcribing",
        name: audio.name,
        message: "このPCのWhisperで文字起こししています。エージェントにはまだ送っていません。",
      };
      this.publish();
      if (!live()) return;
      const form = new FormData();
      form.set(
        "file",
        new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }),
        `audio${extname(audio.name).toLowerCase()}`,
      );
      form.set("response_format", "json");
      form.set("language", "auto");
      if (!live()) return;
      if (now() >= expires) throw Error("文字起こしの制限時間を超えました。");
      const response = await (this.options.fetch ?? fetch)(`${origin}/inference`, {
        method: "POST",
        body: form,
        redirect: "error",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!live()) return;
      if (!response.ok || !response.body)
        throw Error(
          "Whisperの応答を確認できません。サーバの起動・モデルと対応音声形式を確認してください。",
        );
      const reader = response.body.getReader();
      let used = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          if (!live() || now() >= expires) {
            controller.abort();
            throw Error("文字起こしの制限時間を超えました。");
          }
          const { done, value } = await reader.read();
          if (done) break;
          used += value.byteLength;
          if (used > RESPONSE_LIMIT) throw Error("文字起こしの応答が大きすぎます。");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!live()) return;
      if (now() >= expires) throw Error("文字起こしの制限時間を超えました。");
      const text = z
        .object({ text: z.string().max(65_536) })
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
        .text.trim();
      if (!live()) return;
      if (now() >= expires) throw Error("文字起こしの制限時間を超えました。");
      this.state = {
        ...this.state,
        status: "done",
        text,
        message: text
          ? "文字起こしできました。内容を確認してから会話やメモへ渡してください。"
          : "発話を検出できませんでした。",
      };
      this.publish();
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = {
        ...this.state,
        status: "error",
        text: "",
        message: controller.signal.aborted
          ? "文字起こしを停止しました（制限時間5分）。"
          : error instanceof Error
            ? error.message.slice(0, 1000)
            : "文字起こしできませんでした。",
      };
      this.publish();
    } finally {
      if (timer) clearTimeout(timer);
      if (this.active === controller) this.active = null;
      this.inFlight = false;
      this.currentKey = null;
      if (this.state.status === "stopping") {
        this.state = {
          ...this.state,
          status: "idle",
          message: "文字起こしの送受信を中止しました。",
        };
        this.publish();
      }
    }
  }
  private publish(): void {
    ++this.state.revision;
    this.options.changed(this.snapshot());
  }
}
