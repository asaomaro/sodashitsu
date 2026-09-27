import { sessionNameProblem } from "../persist/namedSession.js";

/**
 * 保存した SSH のマシン（20260927-multi-host-machines）の 1 台の形と、宛先・名前の規則。**純粋**（fs・ssh を持たない。architecture「machineRules」）。
 * 登録簿（`MachineCatalog`）・ssh の引数（`sshArgs`）・手元の接続（`MachineLink`）が同じ規則を使う。
 */
export interface MachineProfile {
  /** 不透明な id（32 桁の 16 進。`newMachineId`）。 */
  id: string;
  label: string;
  /** SSH の宛先（`[user@]host` か `ssh://[user@]host[:port]`）。 */
  target: string;
  /** リモートの session の名前（無ければリモートの既定の session）。 */
  session?: string;
  enabled: boolean;
}

export const MAX_LABEL_BYTES = 128;
export const MAX_TARGET_BYTES = 1024;
/** `?machine=`・`wtmctl --machine` の値の上限（文字数）。 */
export const MAX_SELECTOR_LENGTH = 256;
/** 画面の「ローカル」と `/ws?machine=local` の予約名。 */
export const LOCAL_MACHINE_SELECTOR = "local";

const ID_RE = /^[0-9a-f]{32}$/;
/** 宛先に使える文字（空白・制御文字・引用符・`$`・`;`・`&`・`|`・`` ` ``・`\` 等を含まない。ssh へは引数の配列で渡すが、表示・案内にも使うので狭く保つ）。 */
const TARGET_RE = /^[A-Za-z0-9._@%+=:,/[\]~-]+$/;
// 制御文字（C0・DEL・C1）と、表示を偽装できる書式の文字（双方向の上書き・埋め込み・隔離、行・段落の区切り）。名前は一覧と案内に出る。
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

export function isMachineId(id: string): boolean {
  return ID_RE.test(id);
}

/** 宛先が規則に合わなければ理由を返す（合えば undefined）。 */
export function targetProblem(target: string): string | undefined {
  if (target.length === 0) return "宛先が空です";
  if (Buffer.byteLength(target) > MAX_TARGET_BYTES)
    return `宛先が ${MAX_TARGET_BYTES} バイトを超えています`;
  if (target.startsWith("-"))
    return "宛先は - で始められません（ssh のオプションと取り違えるため）";
  if (!TARGET_RE.test(target))
    return "宛先に使えない文字（空白・制御文字・引用符・シェルの記号等）を含みます";
  const authority = target.startsWith("ssh://") ? target.slice("ssh://".length) : target;
  const at = authority.lastIndexOf("@");
  const user = at >= 0 ? authority.slice(0, at) : "";
  const host = at >= 0 ? authority.slice(at + 1) : authority;
  if (user.includes(":"))
    return "宛先にパスワード（user:password@）を含められません。認証は OpenSSH（鍵・ssh-agent）に任せてください";
  // ssh:// の利用者の部分は OpenSSH が %xx を戻す（`you%3Asecret` が `you:secret` になる）。% を使わせない。
  if (user.includes("%")) return "宛先の利用者の部分に % は使えません";
  // 利用者名・ホスト名が - で始まると、ssh_config の %r・%h の展開（ProxyCommand 等）にオプションのような値が入る。
  if (user.startsWith("-") || host.startsWith("-"))
    return "宛先の利用者名・ホスト名は - で始められません";
  if (host.length === 0 || host.startsWith(":")) return "宛先にホスト名がありません";
  return undefined;
}

/**
 * 名前が規則に合わなければ理由を返す。`others` はほかのマシン（`selfId` は名前を変える自分。重複の比較から外す）。
 * 規則: 前後の空白を除いて空でない・128 バイト以下・制御文字なし・`local`（大文字小文字を問わない）でない・ほかのマシンの id と同じでない・
 * ほかのマシンの名前と同じでない（大文字小文字を区別する）。
 */
export function labelProblem(
  label: string,
  others: readonly MachineProfile[],
  selfId?: string,
): string | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) return "名前が空です";
  if (trimmed !== label) return "名前の前後に空白を置けません";
  if (Buffer.byteLength(label) > MAX_LABEL_BYTES)
    return `名前が ${MAX_LABEL_BYTES} バイトを超えています`;
  if (CONTROL_RE.test(label)) return "名前に制御文字を含められません";
  if (label.toLowerCase() === LOCAL_MACHINE_SELECTOR) return "local は手元のマシンの予約名です";
  for (const m of others) {
    if (m.id === selfId) continue;
    if (m.id === label) return "ほかのマシンの id と同じ名前は使えません";
    if (m.label === label) return `名前 ${JSON.stringify(label)} は既に使われています`;
  }
  return undefined;
}

/** リモートの session の名前の問題（無ければ undefined）。 */
export function remoteSessionProblem(session: string | undefined): string | undefined {
  if (session === undefined) return undefined;
  return sessionNameProblem(session);
}
