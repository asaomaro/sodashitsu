import { describe, expect, it } from "vitest";
import { login } from "./httpAuth.js";
import { AuthError } from "./wsClient.js";

function fakeFetch(impl: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string, init: RequestInit) => impl(url, init)) as unknown as typeof fetch;
}

describe("login", () => {
  it("204 + Set-Cookie -> cookie の先頭セグメントを返す", async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url).toBe("http://h:7780/api/login");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ token: "t" });
      return new Response(null, { status: 204, headers: { "set-cookie": "soda_session=abc; Path=/; HttpOnly" } });
    });
    const cookie = await login("http://h:7780", "t", fetchImpl);
    expect(cookie).toBe("soda_session=abc");
  });

  it("Origin/Host ヘッダを url から組み立てて送る", async () => {
    let seenHeaders: Headers | undefined;
    const fetchImpl = fakeFetch((_url, init) => {
      seenHeaders = new Headers(init.headers);
      return new Response(null, { status: 204, headers: { "set-cookie": "soda_session=abc" } });
    });
    await login("http://127.0.0.1:9999", "t", fetchImpl);
    expect(seenHeaders?.get("origin")).toBe("http://127.0.0.1:9999");
    expect(seenHeaders?.get("host")).toBe("127.0.0.1:9999");
  });

  it("401 は AuthError", async () => {
    const fetchImpl = fakeFetch(() => new Response(null, { status: 401 }));
    await expect(login("http://h:7780", "bad", fetchImpl)).rejects.toThrow(AuthError);
  });

  it("204 でも Set-Cookie が無ければ AuthError", async () => {
    const fetchImpl = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(login("http://h:7780", "t", fetchImpl)).rejects.toThrow(AuthError);
  });

  it("fetch 自体が例外を投げたら AuthError に包む", async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(login("http://h:7780", "t", fetchImpl)).rejects.toThrow(AuthError);
  });
});
