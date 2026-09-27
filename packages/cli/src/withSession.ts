import type { GlobalOpts } from "./cliArgs.js";
import { login } from "./httpAuth.js";
import type { SessionStore } from "./session.js";
import { AuthError, connect, type WtmClient } from "./wsClient.js";

/**
 * セッションキャッシュ＋1回だけの再ログイン（design.md「振る舞いの詳細・認証」節）。
 *
 * design の記載は `fn: (cookie) => Promise<T>`（呼び出し側が `connect` する）だが、実装では
 * `fn: (client) => Promise<T>` に変え、`connect`/`close` をここに集約した（decisions.md D16。全コマンドで
 * 同じ2行を繰り返さずに済む。認証・再ログインのフロー自体は design のシーケンス図と同一）。
 */
export class UnauthenticatedError extends Error {}

export async function withSession<T>(opts: GlobalOpts, store: SessionStore, fn: (client: WtmClient) => Promise<T>): Promise<T> {
  const cached = await store.get(opts.url);
  if (cached !== undefined) {
    try {
      return await connectAndRun(opts.url, cached, fn, opts.machine);
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      await store.clear(opts.url);
      // フォールスルーして下の再ログインへ。
    }
  }
  if (!opts.token) {
    throw new UnauthenticatedError(
      cached === undefined
        ? `no cached session for ${opts.url} and no --token/WTMCTL_TOKEN given (run "wtmctl login" or pass --token)`
        : `session for ${opts.url} expired or was revoked, and no --token/WTMCTL_TOKEN given to relogin`,
    );
  }
  const cookie = await login(opts.url, opts.token);
  await store.set(opts.url, cookie);
  return connectAndRun(opts.url, cookie, fn, opts.machine);
}

async function connectAndRun<T>(url: string, cookie: string, fn: (client: WtmClient) => Promise<T>, machine: string | undefined): Promise<T> {
  // `--machine` が無ければ今までどおりの呼び方（20260927-multi-host-machines の AC15）。
  const client = machine === undefined ? await connect(url, cookie) : await connect(url, cookie, machine);
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}
