import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "./session.js";
import { AuthError, RpcFailure, type SodaClient } from "./wsClient.js";
import { UnauthenticatedError, withSession } from "./withSession.js";

vi.mock("./httpAuth.js", () => ({ login: vi.fn() }));
vi.mock("./wsClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./wsClient.js")>();
  return { ...actual, connect: vi.fn() };
});

import { login } from "./httpAuth.js";
import { connect } from "./wsClient.js";

const mockedLogin = vi.mocked(login);
const mockedConnect = vi.mocked(connect);

function fakeClient(): SodaClient {
  return {
    hello: vi.fn(),
    request: vi.fn(),
    sendInput: vi.fn(),
    onEvent: vi.fn(),
    onOutput: vi.fn(),
    onSnapshot: vi.fn(),
    onClose: vi.fn(),
    close: vi.fn(),
  } as unknown as SodaClient;
}

function memoryStore(initial: Record<string, string> = {}): SessionStore {
  const map = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (url: string) => map.get(url)),
    set: vi.fn(async (url: string, cookie: string) => {
      map.set(url, cookie);
    }),
    clear: vi.fn(async (url: string) => {
      map.delete(url);
    }),
  };
}

const URL_ = "http://127.0.0.1:7780";

beforeEach(() => {
  mockedLogin.mockReset();
  mockedConnect.mockReset();
});

describe("withSession", () => {
  it("キャッシュも token も無ければ UnauthenticatedError（login/connect は呼ばれない）", async () => {
    const store = memoryStore();
    await expect(withSession({ url: URL_, token: undefined }, store, vi.fn())).rejects.toThrow(UnauthenticatedError);
    expect(mockedLogin).not.toHaveBeenCalled();
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("キャッシュ無し・token あり: login → store.set → connect → fn の順で実行し、client.close() を呼ぶ", async () => {
    const store = memoryStore();
    mockedLogin.mockResolvedValue("soda_session=fresh");
    const client = fakeClient();
    mockedConnect.mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withSession({ url: URL_, token: "tok" }, store, fn);

    expect(result).toBe("ok");
    expect(mockedLogin).toHaveBeenCalledWith(URL_, "tok");
    expect(store.set).toHaveBeenCalledWith(URL_, "soda_session=fresh");
    expect(mockedConnect).toHaveBeenCalledWith(URL_, "soda_session=fresh");
    expect(fn).toHaveBeenCalledWith(client);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("キャッシュあり・接続成功: login は呼ばれない（AC7 の再利用）", async () => {
    const store = memoryStore({ [URL_]: "soda_session=cached" });
    const client = fakeClient();
    mockedConnect.mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("ok");

    await withSession({ url: URL_, token: undefined }, store, fn);

    expect(mockedLogin).not.toHaveBeenCalled();
    expect(mockedConnect).toHaveBeenCalledWith(URL_, "soda_session=cached");
  });

  it("キャッシュあり・AuthError・token あり: キャッシュを消して1回だけ再ログインし再試行する（FR12）", async () => {
    const store = memoryStore({ [URL_]: "soda_session=stale" });
    mockedConnect.mockRejectedValueOnce(new AuthError("401")).mockResolvedValueOnce(fakeClient());
    mockedLogin.mockResolvedValue("soda_session=fresh");
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withSession({ url: URL_, token: "tok" }, store, fn);

    expect(result).toBe("ok");
    expect(store.clear).toHaveBeenCalledWith(URL_);
    expect(mockedLogin).toHaveBeenCalledTimes(1);
    expect(mockedConnect).toHaveBeenNthCalledWith(1, URL_, "soda_session=stale");
    expect(mockedConnect).toHaveBeenNthCalledWith(2, URL_, "soda_session=fresh");
  });

  it("キャッシュあり・AuthError・token 無し: 「期限切れ」の文言で UnauthenticatedError", async () => {
    const store = memoryStore({ [URL_]: "soda_session=stale" });
    mockedConnect.mockRejectedValueOnce(new AuthError("401"));

    await expect(withSession({ url: URL_, token: undefined }, store, vi.fn())).rejects.toThrow(UnauthenticatedError);
    expect(store.clear).toHaveBeenCalledWith(URL_);
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("再ログイン自体が失敗したら、そのエラーをそのまま伝播する（再試行しない）", async () => {
    const store = memoryStore({ [URL_]: "soda_session=stale" });
    mockedConnect.mockRejectedValueOnce(new AuthError("401"));
    mockedLogin.mockRejectedValue(new AuthError("login failed: HTTP 401"));

    await expect(withSession({ url: URL_, token: "bad-tok" }, store, vi.fn())).rejects.toThrow("login failed");
    expect(mockedLogin).toHaveBeenCalledTimes(1);
    expect(mockedConnect).toHaveBeenCalledTimes(1); // 2回目の connect は呼ばれない
  });

  it("AuthError 以外（RpcFailure 等）は再ログインせずそのまま伝播する", async () => {
    const store = memoryStore({ [URL_]: "soda_session=cached" });
    mockedConnect.mockRejectedValueOnce(new RpcFailure("internal", "boom"));

    await expect(withSession({ url: URL_, token: "tok" }, store, vi.fn())).rejects.toThrow(RpcFailure);
    expect(store.clear).not.toHaveBeenCalled();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("fn が投げても client.close() は呼ばれる", async () => {
    const store = memoryStore({ [URL_]: "soda_session=cached" });
    const client = fakeClient();
    mockedConnect.mockResolvedValue(client);
    const fn = vi.fn().mockRejectedValue(new RpcFailure("not_found", "pane not found"));

    await expect(withSession({ url: URL_, token: undefined }, store, fn)).rejects.toThrow("pane not found");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("--machine（opts.machine）があれば connect に渡す（20260927-multi-host-machines）", async () => {
    const client = fakeClient();
    mockedConnect.mockResolvedValue(client);
    const store = memoryStore({ [URL_]: "soda_session=cached" });
    await withSession({ url: URL_, token: undefined, machine: "GPU" }, store, async () => "ok");
    expect(mockedConnect).toHaveBeenCalledWith(URL_, "soda_session=cached", "GPU");
  });
});
