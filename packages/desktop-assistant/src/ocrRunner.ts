import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import { pngSize } from "./png.js";

export interface OcrLaunch {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  shell: false;
  windowsHide: true;
}
export interface OcrRunnerOptions {
  resolve?: (path: string) => Promise<string>;
  spawn?: (launch: OcrLaunch) => ChildProcessWithoutNullStreams;
  now?: () => number;
  environment?: NodeJS.ProcessEnv;
}
async function resolveEngine(path: string): Promise<string> {
  if (!isAbsolute(path) || !/^tesseract(?:\.exe)?$/i.test(basename(path)))
    throw Error("Tesseract実行ファイルの絶対パスを設定してください。");
  const resolved = await realpath(path);
  if (!/^tesseract(?:\.exe)?$/i.test(basename(resolved)) || !(await stat(resolved)).isFile())
    throw Error("Tesseract実行ファイルを確認できません。");
  return resolved;
}

/** Fixed local OCR command; pixels are stdin, never shell/argv/files or an external endpoint. */
export class OcrRunner {
  constructor(private readonly options: OcrRunnerOptions = {}) {}
  async run(
    png: Uint8Array,
    executable: string,
    language: string,
    signal: AbortSignal,
  ): Promise<string> {
    pngSize(png);
    if (!/^[a-z_]{2,16}(?:\+[a-z_]{2,16}){0,3}$/.test(language))
      throw Error("OCRの言語設定を確認してください。");
    const now = () => this.options.now?.() ?? performance.now();
    const expires = now() + 60_000;
    signal.throwIfAborted();
    const path = await (this.options.resolve ?? resolveEngine)(executable);
    signal.throwIfAborted();
    if (now() >= expires) throw Error("OCRの準備が制限時間を超えました。");
    const source = this.options.environment ?? process.env;
    const env: Record<string, string> = { OMP_THREAD_LIMIT: "2" };
    for (const key of [
      "PATH",
      "SystemRoot",
      "SYSTEMROOT",
      "WINDIR",
      "TEMP",
      "TMP",
      "TMPDIR",
      "HOME",
      "USERPROFILE",
      "LANG",
      "LC_ALL",
      "TESSDATA_PREFIX",
    ])
      if (source[key] !== undefined) env[key] = source[key]!;
    const launch: OcrLaunch = {
      executable: path,
      args: ["stdin", "stdout", "-l", language],
      cwd: dirname(path),
      env,
      shell: false,
      windowsHide: true,
    };
    const child = (
      this.options.spawn ??
      ((request) =>
        spawn(request.executable, request.args, {
          cwd: request.cwd,
          env: request.env,
          shell: false,
          windowsHide: true,
          stdio: "pipe",
        }))
    )(launch);
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let used = 0,
        errorBytes = 0,
        errorText = "",
        failure = "";
      const kill = () => {
        try {
          child.kill("SIGKILL");
        } catch {}
      };
      const abort = () => {
        failure = "OCRを中止しました。";
        kill();
      };
      const timeout = setTimeout(
        () => {
          failure = "OCRの制限時間（60秒）を超えました。";
          kill();
        },
        Math.max(1, Math.ceil(expires - now())),
      );
      signal.addEventListener("abort", abort, { once: true });
      child.once("error", () => {
        failure = "Tesseractを起動できません。実行ファイルと言語データを確認してください。";
      });
      child.stdin.on("error", () => {}); // EPIPE is reported through the bounded process result.
      child.stdout.on("data", (chunk: Buffer) => {
        if (signal.aborted || now() >= expires) {
          failure = "OCRを中止したか制限時間を超えました。";
          kill();
          return;
        }
        used += chunk.byteLength;
        if (used > 256 * 1024) {
          failure = "OCRの出力が大きすぎます。";
          kill();
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (errorBytes >= 16 * 1024) return;
        const part = chunk.subarray(0, 16 * 1024 - errorBytes);
        errorBytes += part.byteLength;
        errorText += part.toString("utf8");
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        if (signal.aborted || now() >= expires || failure) {
          reject(Error(failure || "OCRを中止したか制限時間を超えました。"));
          return;
        }
        if (code !== 0) {
          reject(
            Error(
              `Tesseractで認識できませんでした。言語データを確認してください。${errorText ? `\n${errorText.slice(0, 1000)}` : ""}`,
            ),
          );
          return;
        }
        const text = Buffer.concat(chunks).toString("utf8").trim();
        if (text.length > 65_536) reject(Error("認識結果が長すぎます。画像を切り取ってください。"));
        else resolve(text);
      });
      if (signal.aborted) abort();
      else child.stdin.end(png);
    });
  }
}
