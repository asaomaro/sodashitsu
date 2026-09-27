import { closeSync, fstatSync, readdirSync, readlinkSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, normalize } from "node:path";
import { isatty } from "node:tty";
import { writeFileAtomic } from "../persist/atomicFile.js";

/**
 * 更新時の引き継ぎ（live handoff。20260926-live-handoff）の受け渡しの中身（design「受け渡しの中身 `handoff.json`」）。
 * 古い版が execve の直前に状態ディレクトリへ書き、`process.execve` で入れ替わった新しい版が起動時に読んで**すぐ消す**。
 * 画面の内容（秘密を含みうる）が入るので 0600（`writeFileAtomic`）。PTY の master の fd 自体は execve をまたいで同じプロセスに
 * 残る（close-on-exec が付いていない。research F2.2・F2.3）ので、ここに書くのは fd の番号と pane の対応だけ。
 */
export const HANDOFF_FORMAT_VERSION = 1;
export const HANDOFF_FILE_NAME = "handoff.json";
/** この execve が書いた受け渡しかを確かめる値（古い版が execve の環境に入れる）。新しい版は最初に `process.env` から消す。 */
export const HANDOFF_NONCE_ENV = "SODA_HANDOFF_NONCE";
/** 書いてからこれを過ぎた受け渡しは使わない。 */
export const HANDOFF_MAX_AGE_MS = 60_000;

export interface HandoffPane {
  paneId: string;
  /** PTY の master（3 以上の整数）。 */
  fd: number;
  /** pane のプロセス（シェル）。 */
  pid: number;
  cols: number;
  rows: number;
  /** ミラーの `historyAnsi()`（通常の画面とスクロールバック。空なら ""）。 */
  screen: string;
}

/** スクロールバックを $EDITOR で開いた pane の対応（20260926-edit-scrollback。`SessionService.scrollbackEditors`）。 */
export interface HandoffScrollbackEditor {
  paneId: string;
  sourcePaneId: string;
  previousZoomedPaneId: string | null;
  dir: string;
}

export interface HandoffManifest {
  format: typeof HANDOFF_FORMAT_VERSION;
  /** 要求の id（CLI の `status` の突き合わせ）。 */
  id: string;
  /** 環境変数 `SODA_HANDOFF_NONCE` と同じ値。 */
  nonce: string;
  /** 書いたプロセス（= execve の後の自分）。 */
  pid: number;
  createdAt: string;
  /** 待ち受けていたポート。 */
  port: number;
  panes: HandoffPane[];
  scrollbackEditors: HandoffScrollbackEditor[];
}

export type TakenHandoff =
  /** 引き継ぎの起動ではない（環境変数が無い）。`removedStale` は残っていた `handoff.json` を消したか（ログ用）。 */
  | { kind: "none"; removedStale: boolean }
  /** 環境変数はあるが、受け渡しのファイルが無い・読めない・形が合わない（どの fd がどの pane か分からない）。 */
  | { kind: "broken"; reason: string }
  | {
      kind: "taken";
      id: string;
      port: number;
      /** 使ってよい pane（確かめ済み）。 */
      panes: HandoffPane[];
      /** 使わない pane（nonce・pid・期限・fd の確認に通らなかった）。呼び出し側が fd を閉じ、プロセスに SIGHUP を送る。 */
      rejected: HandoffPane[];
      /** `rejected` の理由（ログ用）。 */
      rejectReason: string | undefined;
      scrollbackEditors: HandoffScrollbackEditor[];
    };

export function handoffManifestPath(stateDir: string): string {
  return join(stateDir, HANDOFF_FILE_NAME);
}

export async function writeHandoffManifest(
  stateDir: string,
  manifest: HandoffManifest,
): Promise<void> {
  await writeFileAtomic(handoffManifestPath(stateDir), `${JSON.stringify(manifest)}\n`);
}

/** 消す。消したら true、無ければ false。それ以外の失敗は投げる。 */
export async function removeHandoffManifest(stateDir: string): Promise<boolean> {
  try {
    await unlink(handoffManifestPath(stateDir));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

const HEX = /^[0-9a-f]+$/;

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function parsePane(v: unknown): HandoffPane | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const p = v as Record<string, unknown>;
  if (!isString(p["paneId"]) || p["paneId"] === "") return undefined;
  if (!isInt(p["fd"], 3, 65535)) return undefined;
  if (!isInt(p["pid"], 1, 2 ** 31 - 1)) return undefined;
  if (!isInt(p["cols"], 1, 65535) || !isInt(p["rows"], 1, 65535)) return undefined;
  if (!isString(p["screen"])) return undefined;
  return {
    paneId: p["paneId"],
    fd: p["fd"],
    pid: p["pid"],
    cols: p["cols"],
    rows: p["rows"],
    screen: p["screen"],
  };
}

function isScrollbackDir(dir: string): boolean {
  return isAbsolute(dir) && normalize(dir) === dir && basename(dir).startsWith("soda-scrollback-");
}

function parseEditor(v: unknown): HandoffScrollbackEditor | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const e = v as Record<string, unknown>;
  if (
    !isString(e["paneId"]) ||
    !isString(e["sourcePaneId"]) ||
    !isString(e["dir"]) ||
    // 引き継いだ後に消すことがあるので、スクロールバックの一時ディレクトリの形（`mkdtemp(<root>/soda-scrollback-)`）以外は受け付けない。
    !isScrollbackDir(e["dir"])
  )
    return undefined;
  const prev = e["previousZoomedPaneId"];
  if (prev !== null && !isString(prev)) return undefined;
  return {
    paneId: e["paneId"],
    sourcePaneId: e["sourcePaneId"],
    previousZoomedPaneId: prev,
    dir: e["dir"],
  };
}

/**
 * 形を確かめる（合わなければ undefined。1 つでも合わない pane があれば全体を undefined にする——対応を取り違えない）。
 * エディタの pane の対応（`scrollbackEditors`）は合わないものだけ落とす。
 */
export function parseHandoffManifest(raw: string): HandoffManifest | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof v !== "object" || v === null) return undefined;
  const m = v as Record<string, unknown>;
  if (m["format"] !== HANDOFF_FORMAT_VERSION) return undefined;
  if (!isString(m["id"]) || !HEX.test(m["id"])) return undefined;
  if (!isString(m["nonce"]) || !HEX.test(m["nonce"]) || m["nonce"].length < 16) return undefined;
  if (!isInt(m["pid"], 1, 2 ** 31 - 1)) return undefined;
  if (!isString(m["createdAt"]) || Number.isNaN(Date.parse(m["createdAt"]))) return undefined;
  if (!isInt(m["port"], 1, 65535)) return undefined;
  if (!Array.isArray(m["panes"]) || !Array.isArray(m["scrollbackEditors"])) return undefined;
  const panes: HandoffPane[] = [];
  const fds = new Set<number>();
  const ids = new Set<string>();
  for (const raw of m["panes"]) {
    const pane = parsePane(raw);
    if (pane === undefined || fds.has(pane.fd) || ids.has(pane.paneId)) return undefined;
    fds.add(pane.fd);
    ids.add(pane.paneId);
    panes.push(pane);
  }
  const scrollbackEditors: HandoffScrollbackEditor[] = [];
  const editorPanes = new Set<string>();
  for (const raw of m["scrollbackEditors"]) {
    // エディタの pane の対応は後始末の補助にすぎないので、合わないものはその 1 件だけ落とす（全体を捨てると全 pane を失う）。
    const editor = parseEditor(raw);
    if (editor === undefined || editorPanes.has(editor.paneId)) continue;
    editorPanes.add(editor.paneId);
    scrollbackEditors.push(editor);
  }
  return {
    format: HANDOFF_FORMAT_VERSION,
    id: m["id"],
    nonce: m["nonce"],
    pid: m["pid"],
    createdAt: m["createdAt"],
    port: m["port"],
    panes,
    scrollbackEditors,
  };
}

/**
 * fd が PTY の端末か。Linux は `/proc/self/fd/<fd>` が `/dev/ptmx`（master。research F3.5）。それ以外（macOS）は `/proc` が無いので
 * 文字デバイスで端末であることだけを見る——**master と slave を見分けられない**（design「`isPtyMaster`」の注。未検証）。
 */
export function isPtyMaster(fd: number, platform: NodeJS.Platform = process.platform): boolean {
  try {
    if (platform === "linux") return isPtmxPath(readlinkSync(`/proc/self/fd/${fd}`));
    return fstatSync(fd).isCharacterDevice() && isatty(fd);
  } catch {
    return false;
  }
}

/** PTY の多重化装置（master）のパス。`/dev/ptmx` が `pts/ptmx` へのリンクの環境（一部のコンテナ）では `/dev/pts/ptmx` になる。 */
function isPtmxPath(target: string): boolean {
  return target === "/dev/ptmx" || target === "/dev/pts/ptmx";
}

export interface TakeHandoffDeps {
  pid?: number;
  now?: () => number;
  platform?: NodeJS.Platform;
  isPtyMaster?: (fd: number) => boolean;
}

/**
 * 起動時に受け渡しを受け取る（design「`takeHandoff`」）。環境変数とファイルは、使っても使わなくても**必ず消す**（AC8）。
 * 読めた pane の fd は、確かめに通ったものを `panes`、通らなかったものを `rejected` に分ける。
 */
export async function takeHandoff(
  stateDir: string,
  env: NodeJS.ProcessEnv,
  deps: TakeHandoffDeps = {},
): Promise<TakenHandoff> {
  const nonce = env[HANDOFF_NONCE_ENV];
  delete env[HANDOFF_NONCE_ENV];
  const path = handoffManifestPath(stateDir);
  let raw: string | undefined;
  let readError: string | undefined;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    readError = (err as NodeJS.ErrnoException).code ?? String(err);
  }
  const removed = await removeHandoffManifest(stateDir).catch(() => false);
  if (nonce === undefined || nonce === "") return { kind: "none", removedStale: removed };
  if (raw === undefined)
    return { kind: "broken", reason: `cannot read ${path}: ${readError ?? "unknown"}` };
  const manifest = parseHandoffManifest(raw);
  if (manifest === undefined) return { kind: "broken", reason: `${path} is malformed` };

  const base = {
    kind: "taken" as const,
    id: manifest.id,
    port: manifest.port,
    scrollbackEditors: manifest.scrollbackEditors,
  };
  const pid = deps.pid ?? process.pid;
  const now = (deps.now ?? Date.now)();
  let reason: string | undefined;
  if (manifest.nonce !== nonce) reason = "nonce mismatch";
  else if (manifest.pid !== pid) reason = `written by pid ${manifest.pid}, not ${pid}`;
  else {
    const age = now - Date.parse(manifest.createdAt);
    if (age > HANDOFF_MAX_AGE_MS) reason = "too old";
    else if (age < -HANDOFF_MAX_AGE_MS) reason = "created in the future";
  }
  if (reason !== undefined)
    return { ...base, panes: [], rejected: manifest.panes, rejectReason: reason };

  const platform = deps.platform ?? process.platform;
  const check = deps.isPtyMaster ?? ((fd: number) => isPtyMaster(fd, platform));
  const panes: HandoffPane[] = [];
  const rejected: HandoffPane[] = [];
  for (const pane of manifest.panes) (check(pane.fd) ? panes : rejected).push(pane);
  return {
    ...base,
    panes,
    rejected,
    rejectReason: rejected.length > 0 ? "not a pty master" : undefined,
  };
}

/**
 * 受け渡しが壊れていて、どの fd がどの pane か分からないとき、このプロセスに残った PTY の master を全部閉じる（design「`takeHandoff`」手順 4）。
 * 呼ぶのは起動の最初（自分で PTY を開く前）だけ。閉じると各シェルに hangup が届く（見えないまま残さない）。Linux だけ（`/proc/self/fd` を列挙する）。
 * 閉じた fd の数を返す。
 */
export function closeOrphanPtyMasters(
  opts: {
    platform?: NodeJS.Platform;
    fdDir?: string;
    close?: (fd: number) => void;
    /** 閉じない fd（このプロセスの端末が使っている master）。 */
    keep?: ReadonlySet<number>;
  } = {},
): number {
  const { platform = process.platform, fdDir = "/proc/self/fd", close = closeSync, keep } = opts;
  if (platform !== "linux") return 0;
  let closed = 0;
  let entries: string[];
  try {
    entries = readdirSync(fdDir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const fd = Number(name);
    if (!Number.isInteger(fd) || fd < 3 || keep?.has(fd)) continue;
    let target: string;
    try {
      target = readlinkSync(join(fdDir, name));
    } catch {
      continue;
    }
    if (!isPtmxPath(target)) continue;
    try {
      close(fd);
      closed++;
    } catch {
      // 既に閉じている。
    }
  }
  return closed;
}
