/**
 * `Retry-After`（429 の応答。RFC 9110 10.2.3）の読み取りと、待ち時間の正規化（D105）。`net/Connection` の `login` と
 * `LoginView` の表示が同じ規則を使う。soda 自身は `Retry-After` を付けない（`LoginRateLimiter`）ので、値が入るのは前段の
 * プロキシ等が付けた場合だけ。読めない・信じられない値は null にして、ログイン画面はサーバの制限から出す既定の文言に戻す。
 */

/** これより長い待ち時間は信じない（null にする）。soda の制限は最長 1 時間なので、前段のプロキシの値でも 1 日あれば足りる。 */
export const RETRY_AFTER_MAX_SECONDS = 24 * 60 * 60;

/**
 * 待ち時間（秒）を「1 以上 `RETRY_AFTER_MAX_SECONDS` 以下の整数」にする。有限でない・上限を超える値は null（既定の文言へ）。
 * 0 以下（`Retry-After: 0`・過去の日付）は 1（「0 秒ほど待って」と出さない）。端数は切り上げる。
 */
export function normalizeRetryAfterSeconds(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds > RETRY_AFTER_MAX_SECONDS) return null;
  return Math.max(1, Math.ceil(seconds));
}

/**
 * IMF-fixdate（`Sun, 06 Nov 1994 08:49:37 GMT`）。RFC 9110 は送り手にこの形を求める。廃止された形（RFC 850・asctime）は
 * 読まない（asctime は時差を持たず `Date.parse` が地方時として読む）——`Date.parse` は "soon 5" のような文字列まで何かの日付に
 * 読んでしまうので、形を確かめてから渡す。
 */
const IMF_FIXDATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** `Retry-After` の値（秒数か IMF-fixdate）を、今から何秒待つかにする（`normalizeRetryAfterSeconds` の規則）。無い・読めないときは null。 */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return normalizeRetryAfterSeconds(Number(trimmed));
  if (!IMF_FIXDATE.test(trimmed)) return null;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return normalizeRetryAfterSeconds((at - nowMs) / 1000);
}
