import { hasForbiddenChars, type ExtensionInfo } from "@sodashitsu/protocol";

/**
 * 承認の画面の見せ方（純粋。20261007-ext-host PR3 の design「ブラウザ」）。承認のダイアログで、コマンドの全文を、省略なく・偽れない形で読めるようにする部品。
 * 文はすべてここで作り、画面は `textContent` として出す（コマンド・説明・パスを `v-html` に渡さない）。
 */

/** 承認の鍵に入る項目（`ExtensionApprovalView.previous` と同じ形）。 */
export interface EntryView {
  command: string;
  description: string | null;
  enabled: boolean;
  allow: readonly string[];
  onUnresponsive: string;
}

const FIELD_LABEL: Record<keyof EntryView, string> = {
  command: "コマンド",
  description: "説明",
  enabled: "有効",
  allow: "許可",
  onUnresponsive: "応答しないとき",
};

export interface FieldDiff {
  field: keyof EntryView;
  label: string;
  before: string;
  after: string;
}

function show(field: keyof EntryView, e: EntryView): string {
  if (field === "allow") return allowText(e.allow);
  if (field === "description") return e.description === null || e.description === "" ? "（なし）" : e.description;
  if (field === "enabled") return e.enabled ? "有効" : "無効";
  if (field === "onUnresponsive") return e.onUnresponsive === "block" ? "止める" : "素通し";
  return e.command;
}

/** 前に承認した中身と、いまの登録の、**変わった項目だけ**（`allow` は並びを無視）。 */
export function diffEntry(previous: EntryView, current: EntryView): FieldDiff[] {
  const out: FieldDiff[] = [];
  const same = (field: keyof EntryView): boolean => {
    if (field === "allow") return [...previous.allow].sort().join("\0") === [...current.allow].sort().join("\0");
    if (field === "description") return (previous.description ?? "") === (current.description ?? "");
    return previous[field] === current[field];
  };
  for (const field of ["command", "description", "enabled", "allow", "onUnresponsive"] as const) {
    if (!same(field)) out.push({ field, label: FIELD_LABEL[field], before: show(field, previous), after: show(field, current) });
  }
  return out;
}

/** 見た目の似た別の文字（キリル文字など）に気づけるよう、ASCII（U+0020〜U+007E）でない文字があるか。 */
export function hasNonAscii(s: string): boolean {
  return /[^\x20-\x7E]/.test(s);
}

/** ASCII でない文字の一覧（`а (U+0430)` の形）。重複を除いて 16 個まで。残りは `more`。 */
export function nonAsciiList(s: string, max = 16): { items: string[]; more: number } {
  const seen = new Set<string>();
  for (const ch of s) if (/[^\x20-\x7E]/.test(ch)) seen.add(ch);
  const all = [...seen].map((ch) => `${ch} (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`);
  return { items: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** 禁止する文字（制御・書字方向・幅の無い文字・U+0020 以外の空白など）を `\u{…}` に替える。サーバが既に断っているが、画面でも二重に。 */
export function showPath(s: string): string {
  let out = "";
  for (const ch of s) out += hasForbiddenChars(ch) ? `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}` : ch;
  return out;
}

/** 求めている許可の文。 */
export function allowText(allow: readonly string[]): string {
  return allow.length === 0 ? "なし" : [...allow].sort().join("、");
}

/** 承認の確認を開いたとき、その拡張と**同じ根**の `pending` の `key` の一覧（一覧の順）。開いた後に増えたものは入れない。 */
export function pendingQueue(list: readonly ExtensionInfo[], key: string): string[] {
  const root = list.find((e) => e.key === key)?.root;
  if (root === undefined) return list.some((e) => e.key === key) ? [key] : [];
  return list.filter((e) => e.scope === "project" && e.root === root && e.state === "pending").map((e) => e.key);
}

/** `queue`（開いたときの一覧）の、`afterKey` の次の、いまも `pending` のもの。無ければ `null`。 */
export function nextInQueue(queue: readonly string[], list: readonly ExtensionInfo[], afterKey: string): string | null {
  const from = queue.indexOf(afterKey);
  const pending = new Set(list.filter((e) => e.state === "pending").map((e) => e.key));
  for (let i = from + 1; i < queue.length; i++) if (pending.has(queue[i]!)) return queue[i]!;
  return null;
}

/**
 * 承認待ちの知らせ（消えないトースト）に出す件数。`pending`（`disabled` は入らない）のうち、利用者が閉じていない（`dismissed` に `key:digest` が無い）もの。
 * 0 なら `null`（知らせを消す）。
 */
export function pendingNotice(list: readonly ExtensionInfo[], dismissed: ReadonlySet<string>): { count: number; ids: string[]; keys: string[] } | null {
  const fresh = list.filter((e) => e.scope === "project" && e.state === "pending" && e.approval !== undefined && !dismissed.has(`${e.key}:${e.approval.digest}`));
  return fresh.length === 0 ? null : { count: fresh.length, ids: fresh.map((e) => `${e.key}:${e.approval!.digest}`), keys: fresh.map((e) => e.key) };
}

/** 承認の有無の短い文（`disabled` の行にも出す）。 */
export function approvalStatusText(a: NonNullable<ExtensionInfo["approval"]>): string {
  if (a.status === "approved") return "承認済み";
  if (a.status === "denied") return "承認しない";
  return a.approvedAlive ? "未承認（前に承認した中身の記録が残っています）" : "未承認";
}
