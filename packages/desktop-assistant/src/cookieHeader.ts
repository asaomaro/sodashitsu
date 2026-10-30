export function isSodaSessionCookie(name: string): boolean {
  return /^soda_session(?:_[A-Za-z0-9._-]{1,64})?$/.test(name);
}

/** The caller passes only cookies matched by Electron for the configured /ws URL.
 * Like browser HTTP requests, include named-session cookies on that same host/path.
 * No cookie content is returned to a renderer, log, command line or another origin. */
export function sodaCookieHeader(
  cookies: readonly { name: string; value: string; path?: string }[],
): string | null {
  const matching = cookies.filter(
    (cookie) => isSodaSessionCookie(cookie.name) && cookie.path === "/",
  );
  if (matching.length > 64) throw Error("Too many Soda session cookies");
  const parts: string[] = [];
  for (const cookie of matching) {
    if (!cookie.value || cookie.value.length > 2048 || /[\x00-\x20\x7f;,]/.test(cookie.value))
      throw Error("Invalid Soda session cookie");
    parts.push(`${cookie.name}=${cookie.value}`);
  }
  const header = parts.join("; ");
  if (header.length > 8192) throw Error("Soda session cookie header is too large");
  return header || null;
}
