import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../persist/atomicFile.js";
import {
  isMachineId,
  labelProblem,
  remoteSessionProblem,
  targetProblem,
  type MachineProfile,
} from "./machineRules.js";

export type { MachineProfile } from "./machineRules.js";

/**
 * 保存した SSH のマシンの登録簿（20260927-multi-host-machines の design「登録簿」・decisions D4）。状態ディレクトリの**根**の `machines.json`
 * （名前付き session どうしで共有する）。1 台ごとに不透明な id・名前・宛先・リモートの session・有効かだけを持ち、**秘密は持たない**。
 * 知らない項目・規則に合わない値・大きすぎるファイル・多すぎる台数・重複した id は読み込みを拒む（書き足された秘密を黙って持ち回らない）。
 */
export const MACHINES_FILE_NAME = "machines.json";
export const MAX_CATALOG_BYTES = 64 * 1024;
export const MAX_MACHINES = 64;

export interface MachineCatalogData {
  version: 1;
  machines: MachineProfile[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

export function machinesFilePath(root: string): string {
  return join(root, MACHINES_FILE_NAME);
}

export function newMachineId(): string {
  return randomBytes(16).toString("hex");
}

export function emptyCatalog(): MachineCatalogData {
  return { version: 1, machines: [] };
}

const PROFILE_KEYS = new Set(["id", "label", "target", "session", "enabled"]);

/** 形と規則を確かめて返す。合わなければ `CatalogError`（理由つき）。 */
export function validateCatalog(raw: unknown): MachineCatalogData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new CatalogError("the catalog is not an object");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r))
    if (k !== "version" && k !== "machines") throw new CatalogError(`unknown field: ${k}`);
  if (r["version"] !== 1)
    throw new CatalogError(`unsupported catalog version: ${String(r["version"])}`);
  if (!Array.isArray(r["machines"])) throw new CatalogError("machines must be an array");
  const list = r["machines"] as unknown[];
  if (list.length > MAX_MACHINES) throw new CatalogError(`more than ${MAX_MACHINES} machines`);
  const machines: MachineProfile[] = [];
  const ids = new Set<string>();
  for (const [i, item] of list.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new CatalogError(`machines[${i}] is not an object`);
    const m = item as Record<string, unknown>;
    for (const k of Object.keys(m))
      if (!PROFILE_KEYS.has(k)) throw new CatalogError(`machines[${i}]: unknown field: ${k}`);
    const { id, label, target, session, enabled } = m;
    if (typeof id !== "string" || !isMachineId(id))
      throw new CatalogError(`machines[${i}]: invalid id`);
    if (ids.has(id)) throw new CatalogError(`machines[${i}]: duplicate id ${id}`);
    if (typeof label !== "string") throw new CatalogError(`machines[${i}]: label must be a string`);
    if (typeof target !== "string")
      throw new CatalogError(`machines[${i}]: target must be a string`);
    if (session !== undefined && typeof session !== "string")
      throw new CatalogError(`machines[${i}]: session must be a string`);
    if (typeof enabled !== "boolean")
      throw new CatalogError(`machines[${i}]: enabled must be a boolean`);
    const tp = targetProblem(target);
    if (tp !== undefined) throw new CatalogError(`machines[${i}]: invalid target (${tp})`);
    const sp = remoteSessionProblem(session);
    if (sp !== undefined) throw new CatalogError(`machines[${i}]: invalid session (${sp})`);
    ids.add(id);
    machines.push({ id, label, target, ...(session !== undefined ? { session } : {}), enabled });
  }
  // 名前の規則は全台が揃ってから見る（ほかのマシンの id・名前との衝突を含む）。
  for (const [i, m] of machines.entries()) {
    const lp = labelProblem(m.label, machines, m.id);
    if (lp !== undefined) throw new CatalogError(`machines[${i}]: invalid label (${lp})`);
  }
  return { version: 1, machines };
}

export type CatalogLoad =
  | { kind: "ok"; data: MachineCatalogData }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

/** 読む。無ければ `missing`、読めない・大きすぎる・壊れている・規則に合わなければ `invalid`（投げない）。 */
export async function loadCatalog(root: string): Promise<CatalogLoad> {
  // 上限を超える分は読まない（巨大な・読み終わらないファイルを丸ごとメモリに載せない）。
  let raw: Buffer;
  try {
    const fh = await open(machinesFilePath(root), "r");
    try {
      const buf = Buffer.alloc(MAX_CATALOG_BYTES + 1);
      let n = 0;
      for (;;) {
        const { bytesRead } = await fh.read(buf, n, buf.byteLength - n, null);
        if (bytesRead === 0) break;
        n += bytesRead;
        if (n > MAX_CATALOG_BYTES) break;
      }
      raw = buf.subarray(0, n);
    } finally {
      await fh.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return {
      kind: "invalid",
      reason: `cannot read ${MACHINES_FILE_NAME}: ${(err as Error).message}`,
    };
  }
  if (raw.byteLength > MAX_CATALOG_BYTES)
    return { kind: "invalid", reason: `${MACHINES_FILE_NAME} exceeds ${MAX_CATALOG_BYTES} bytes` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return { kind: "invalid", reason: `${MACHINES_FILE_NAME} is not valid JSON` };
  }
  try {
    return { kind: "ok", data: validateCatalog(parsed) };
  } catch (err) {
    return { kind: "invalid", reason: `${MACHINES_FILE_NAME}: ${(err as Error).message}` };
  }
}

/** 検証してから原子的に書く（`writeFileAtomic` は 0600）。 */
export async function saveCatalog(root: string, data: MachineCatalogData): Promise<void> {
  const valid = validateCatalog(data);
  const text = `${JSON.stringify(valid, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_CATALOG_BYTES)
    throw new CatalogError(`${MACHINES_FILE_NAME} would exceed ${MAX_CATALOG_BYTES} bytes`);
  await writeFileAtomic(machinesFilePath(root), text);
}

export type SelectorResult =
  { kind: "ok"; machine: MachineProfile } | { kind: "unknown" } | { kind: "ambiguous" };

/** 有効なマシンのうち、id の完全一致を優先し、次に名前の完全一致（1 台なら ok・2 台以上なら ambiguous）。 */
export function resolveSelector(
  machines: readonly MachineProfile[],
  selector: string,
): SelectorResult {
  const enabled = machines.filter((m) => m.enabled);
  const byId = enabled.find((m) => m.id === selector);
  if (byId) return { kind: "ok", machine: byId };
  const byLabel = enabled.filter((m) => m.label === selector);
  if (byLabel.length === 1) return { kind: "ok", machine: byLabel[0]! };
  return byLabel.length === 0 ? { kind: "unknown" } : { kind: "ambiguous" };
}
