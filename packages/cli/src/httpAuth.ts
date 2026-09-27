import { AuthError } from "./wsClient.js";

/**
 * `POST /api/login`（design.md「依拠する既存の事実」）。成功すれば `Set-Cookie` の先頭セグメント
 * （`soda_session=...`）を返す。それ以外はすべて `AuthError`。
 */
export async function login(url: string, token: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  let res: Response;
  try {
    res = await fetchImpl(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: u.host },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    throw new AuthError(`could not reach ${origin}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status !== 204) {
    throw new AuthError(`login failed: HTTP ${res.status}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new AuthError("login did not set a cookie");
  return setCookie.split(";")[0]!;
}
