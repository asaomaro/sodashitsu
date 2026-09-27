import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown> | undefined): void;
  info(msg: string, fields?: Record<string, unknown> | undefined): void;
  warn(msg: string, fields?: Record<string, unknown> | undefined): void;
  error(msg: string, fields?: Record<string, unknown> | undefined): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * コンソール（`debug`/`info` は stdout、`warn`/`error` は stderr）と `<状態ディレクトリ>/server.log` の
 * 両方へ出す（architecture.md「log/Logger」。MVP はローテーションなし）。
 * ファイルへの書き込みは fire-and-forget（ログの失敗でサーバを止めない）。
 */
export class FileLogger implements Logger {
  private readonly filePath: string;
  private readonly minLevel: LogLevel;
  private ready: Promise<void>;
  /** ファイルへの書き込みの最後（`flush` が待つ。書き込みは届いた順に 1 つずつ行う）。 */
  private tail: Promise<void>;

  constructor(filePath: string, minLevel: LogLevel = "info") {
    this.filePath = filePath;
    this.minLevel = minLevel;
    this.ready = mkdir(dirname(filePath), { recursive: true }).then(() => undefined);
    this.tail = this.ready.catch(() => undefined);
  }

  debug(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.emit("debug", msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.emit("info", msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.emit("warn", msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.emit("error", msg, fields);
  }

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown> | undefined): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(line + "\n");
    this.tail = this.tail
      .then(() => this.ready)
      .then(() => appendFile(this.filePath, line + "\n"))
      .catch(() => {
        // ファイルへの書き込み失敗はサーバを止めない（design「エラー処理」の方針に合わせる）。
      });
  }

  /**
   * それまでに出したログのファイルへの書き込みを待つ（20260926-live-handoff。execve の前——execve は後始末を走らせないので、
   * 書きかけのログは失われる）。失敗しても投げない。
   */
  flush(): Promise<void> {
    return this.tail;
  }
}

/** テスト・smoke 用のメモリロガー。 */
export class MemoryLogger implements Logger {
  readonly lines: { level: LogLevel; msg: string; fields?: Record<string, unknown> | undefined }[] = [];
  debug(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.lines.push({ level: "debug", msg, fields });
  }
  info(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.lines.push({ level: "info", msg, fields });
  }
  warn(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.lines.push({ level: "warn", msg, fields });
  }
  error(msg: string, fields?: Record<string, unknown> | undefined): void {
    this.lines.push({ level: "error", msg, fields });
  }
}
