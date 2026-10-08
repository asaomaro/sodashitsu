import type { ExtensionInfo, ExtensionRunState } from "@sodashitsu/protocol";

/**
 * 拡張の一覧の見せ方（純粋。20261007-ext-host の design「ブラウザ」）。状態 → 文、`lastExit` → 文、並べ方、「続けて落ちた」の判定。
 * 文はすべてここで作り、画面は `textContent` として出す（作者の説明・id・パスを `v-html` に渡さない）。
 */

const STATE_LABEL: Record<ExtensionRunState, string> = {
  running: "動作中",
  backoff: "落ちたので、起動し直しを待っています",
  failed: "続けて落ちたので止めました",
  exited: "終了しました（自分で終わりました）",
  disabled: "無効",
  pending: "承認待ち",
  denied: "承認しない",
  over_limit: "同時に動かせる数の上限のため、動かしていません",
  waiting: "設定を読めないので、起動を見送っています（読めれば起動します）",
};

/** 状態の文。`disabled` は「設定で無効」か「画面で無効にした」を分ける。 */
export function stateText(info: Pick<ExtensionInfo, "state" | "enabledInConfig" | "disabledByUser">): string {
  if (info.state === "disabled") {
    if (info.disabledByUser) return "無効（画面で無効にしました）";
    if (!info.enabledInConfig) return "無効（設定で無効です）";
    return "無効";
  }
  return STATE_LABEL[info.state];
}

const EXIT_REASON: Record<NonNullable<ExtensionInfo["lastExit"]>["reason"], string> = {
  exited: "自分で終了しました",
  crashed: "異常終了しました",
  spawn_failed: "起動できませんでした",
  bad_lines: "壊れた行を続けて送ったので止めました",
  not_reading: "出力を読まなくなったので止めました",
  stopped: "止めました",
};

/** `lastExit` → 文（終了コード・合図があれば添える）。無ければ空文字。 */
export function lastExitText(exit: ExtensionInfo["lastExit"]): string {
  if (!exit) return "";
  const detail: string[] = [];
  if (exit.code !== null) detail.push(`終了コード ${exit.code}`);
  if (exit.signal !== null) detail.push(`合図 ${exit.signal}`);
  return `前回: ${EXIT_REASON[exit.reason]}${detail.length > 0 ? `（${detail.join("、")}）` : ""}`;
}

const STATE_ORDER: Record<ExtensionRunState, number> = {
  pending: 0,
  running: 1,
  backoff: 2,
  waiting: 3,
  failed: 4,
  over_limit: 5,
  exited: 6,
  denied: 7,
  disabled: 8,
};

/** 並べ方: 承認待ち → 動作中 → ほか（状態の順、同じならサーバの順。安定に並べる）。 */
export function sortExtensions(list: readonly ExtensionInfo[]): ExtensionInfo[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => STATE_ORDER[a.e.state] - STATE_ORDER[b.e.state] || a.i - b.i)
    .map((x) => x.e);
}

/** 前の一覧で `failed` でなかった（無かった）拡張が、今回 `failed` になったもの。`prev` が無い（最初の一覧）ときは空（出さない）。 */
export function newlyFailed(prev: readonly ExtensionInfo[] | null, next: readonly ExtensionInfo[]): ExtensionInfo[] {
  if (prev === null) return [];
  const was = new Map(prev.map((e) => [e.key, e.state]));
  return next.filter((e) => e.state === "failed" && was.get(e.key) !== "failed");
}

/** 「続けて落ちた」のトーストの文。 */
export function failedToastText(id: string): string {
  return `拡張『${id}』が続けて落ちたので止めました（設定 › 拡張）`;
}

/** 種類の印（利用者／プロジェクト＋根）。 */
export function scopeText(info: Pick<ExtensionInfo, "scope" | "root">): string {
  return info.scope === "user" ? "利用者" : `プロジェクト ${info.root ?? ""}`.trim();
}

/** `script-html` を許可しているのに、設定が無効のとき出す文（出さないときは null）。 */
export function scriptDisabledNote(info: Pick<ExtensionInfo, "allow">, displayScriptEnabled: boolean): string | null {
  if (displayScriptEnabled || !info.allow.includes("script-html")) return null;
  return "サーバの設定『スクリプトが動く表示』が無効なので、スクリプトの面は出ません";
}

/**
 * ログの 1 行の二重の無害化（サーバが既に置き換えているが、画面でも）。制御文字（タブ以外）・書字方向を変える文字を `?` に替える。
 * 見た目の並びを入れ替えられないように、また端末の制御列が画面の文字として効かないようにする。
 */
export function sanitizeLogLine(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "?");
}
