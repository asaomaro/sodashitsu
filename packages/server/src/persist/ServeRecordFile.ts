import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicFile.js";

/**
 * 起動の記録（20260926-named-session-ui の design「記録」）。待ち受けに成功したサーバが状態ディレクトリに書き、止まっても消さない。
 * 2 役：名前付き session のポートの記憶（`--port` の無い起動で使う）と、session の一覧の「開くための情報」（`wtm.lock` の持ち主と
 * pid・ホスト名が一致するときだけ信じる。`namedSession.ts` の `listServerSessions`）。秘密は持たない（0600 は他の状態ファイルに揃えた）。
 */
export const SERVE_RECORD_FILE_NAME = "serve.json";

export interface ServeRecord {
  schema: 1;
  /** 書いたプロセス。 */
  pid: number;
  /** 書いたホスト（`os.hostname()`。`StateDirLock` と同じ）。 */
  hostname: string;
  /** 実際に待ち受けたポート。 */
  port: number;
  /** TLS で待ち受けたか。 */
  https: boolean;
  /** 待ち受けのホスト（`--host`。角括弧なし）。 */
  host: string;
  savedAt: string;
}

export function serveRecordPath(stateDir: string): string {
  return join(stateDir, SERVE_RECORD_FILE_NAME);
}

export async function writeServeRecord(
  stateDir: string,
  record: Omit<ServeRecord, "schema" | "savedAt">,
): Promise<void> {
  const data: ServeRecord = { schema: 1, ...record, savedAt: new Date().toISOString() };
  await writeFileAtomic(serveRecordPath(stateDir), `${JSON.stringify(data, null, 2)}\n`);
}

function isPort(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 65535;
}

/** 形を確かめる（合わなければ undefined）。 */
export function parseServeRecord(raw: string): ServeRecord | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (r["schema"] !== 1) return undefined;
  if (typeof r["pid"] !== "number" || !Number.isInteger(r["pid"]) || r["pid"] <= 0)
    return undefined;
  if (typeof r["hostname"] !== "string") return undefined;
  if (!isPort(r["port"])) return undefined;
  if (typeof r["https"] !== "boolean") return undefined;
  if (typeof r["host"] !== "string" || r["host"].length === 0) return undefined;
  return {
    schema: 1,
    pid: r["pid"],
    hostname: r["hostname"],
    port: r["port"],
    https: r["https"],
    host: r["host"],
    savedAt: typeof r["savedAt"] === "string" ? r["savedAt"] : "",
  };
}

/** 無い・読めない・JSON でない・形が合わない（ポートが範囲外を含む）なら undefined。投げない。 */
export async function readServeRecord(stateDir: string): Promise<ServeRecord | undefined> {
  let raw: string;
  try {
    raw = await readFile(serveRecordPath(stateDir), "utf8");
  } catch {
    return undefined;
  }
  return parseServeRecord(raw);
}
