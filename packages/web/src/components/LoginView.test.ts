import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import type { LoginResult } from "@sodashitsu/client-core";
import { useViewStore } from "../store/view.js";
import LoginView from "./LoginView.vue";

function makeConn() {
  return { login: vi.fn(), connect: vi.fn(), request: vi.fn(), sendInput: vi.fn(), logout: vi.fn() };
}

let pinia: Pinia;

function mountLogin(conn: ReturnType<typeof makeConn>) {
  return mount(LoginView, { global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: conn } }, attachTo: document.body });
}

beforeEach(() => {
  window.location.hash = "";
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("LoginView — 手動ログイン", () => {
  it("token を入力して送信すると login() → 成功なら connect() を呼ぶ", async () => {
    const conn = makeConn();
    conn.login.mockResolvedValue({ ok: true } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("secret-token");
    await wrapper.get("form").trigger("submit");
    await Promise.resolve();
    expect(conn.login).toHaveBeenCalledWith("secret-token");
    expect(conn.connect).toHaveBeenCalledTimes(1);
  });

  it("login() が失敗なら connect() を呼ばず、エラーを表示する", async () => {
    const conn = makeConn();
    conn.login.mockResolvedValue({ ok: false, reason: "bad_token" } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("wrong-token");
    await wrapper.get("form").trigger("submit");
    await Promise.resolve();
    expect(conn.connect).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("空欄では送信しない", async () => {
    const conn = makeConn();
    const wrapper = mountLogin(conn);
    await wrapper.get("form").trigger("submit");
    expect(conn.login).not.toHaveBeenCalled();
  });
});

describe("LoginView — URL の #token による自動ログイン", () => {
  it("#token= があれば自動で login()・connect() し、history.replaceState で URL から消す", async () => {
    window.location.hash = "#token=abc123";
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const conn = makeConn();
    conn.login.mockResolvedValue({ ok: true } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    expect(conn.login).toHaveBeenCalledWith("abc123");
    expect(conn.connect).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    replaceStateSpy.mockRestore();
  });

  it("#token= が無ければ自動ログインしない", async () => {
    const conn = makeConn();
    mountLogin(conn);
    await Promise.resolve();
    expect(conn.login).not.toHaveBeenCalled();
  });
});

/** 手動で送信して、失敗の表示（`role="alert"` の中の文字列）を返す。 */
async function submitAndReadAlert(result: LoginResult): Promise<{ text: string; command: string | null; connectCalls: number }> {
  const conn = makeConn();
  conn.login.mockResolvedValue(result);
  const wrapper = mountLogin(conn);
  await wrapper.get("input").setValue("some-token");
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  const alert = wrapper.get('[role="alert"]');
  const command = alert.find(".login-view-error-command");
  const out = { text: alert.text(), command: command.exists() ? command.text() : null, connectCalls: conn.connect.mock.calls.length };
  wrapper.unmount();
  return out;
}

/**
 * D105：失敗を理由ごとに示す。以前は全ての失敗を「ログインできませんでした」の 1 文で出していたため、Origin の不一致（403）の
 * 利用者が token の誤りと思い込み `soda token reset` へ進んでいた。
 */
describe("LoginView — 失敗の理由ごとの表示（D105）", () => {
  it("401（token の誤り）は token が違うと示す", async () => {
    const { text, command, connectCalls } = await submitAndReadAlert({ ok: false, reason: "bad_token" });
    expect(text).toContain("token が違います");
    expect(command).toBeNull();
    expect(connectCalls).toBe(0);
  });

  it("403（Origin の不一致）は、このページの Origin と `--origin <その Origin>` を示し、token とは関係ない（まだ確かめていない）と言う", async () => {
    const origin = window.location.origin;
    const { text, command } = await submitAndReadAlert({ ok: false, reason: "origin_rejected" });
    expect(text).toContain(`このページのアドレス（${origin}）`);
    expect(text).toContain("この拒否は token とは関係ありません（token はまだ確かめていません）");
    // サーバは 429 → 403 → 400 → 401 の順に確かめるので、403 の時点では token の正誤は分からない——正しいとも誤りとも言わず、
    // token を作り直すようにも言わない（独立点検の指摘）。
    expect(text).not.toContain("token が違います");
    expect(text).not.toContain("token の誤りではない");
    expect(text).not.toContain("token reset");
    expect(command).toBe(`--origin ${origin}`);
  });

  it("429（失敗の続きすぎ）は待つよう示す。Retry-After が無ければサーバの制限（1 分に 5 回・1 時間に 20 回）から目安を出す", async () => {
    const { text } = await submitAndReadAlert({ ok: false, reason: "rate_limited", retryAfterSeconds: null });
    expect(text).toContain("ログインの失敗が続いた");
    expect(text).toContain("正しい token でも入れません");
    expect(text).toContain("1 分ほど待って");
    // `LoginRateLimiter` は 1 時間の失敗が 20 回に「達した」ら止める（`>= HOUR_LIMIT`。独立点検の指摘）。
    expect(text).toContain("1 時間に 20 回に達したときは、最長 1 時間");
    expect(text).not.toContain("超えた");
  });

  it("429 に Retry-After があれば、その時間を示す（60 秒未満は秒、それ以上は分に切り上げ）", async () => {
    expect((await submitAndReadAlert({ ok: false, reason: "rate_limited", retryAfterSeconds: 30 })).text).toContain("30 秒ほど待って");
    expect((await submitAndReadAlert({ ok: false, reason: "rate_limited", retryAfterSeconds: 90 })).text).toContain("2 分ほど待って");
  });

  it("Retry-After の待ち時間が 0 以下なら「1 秒ほど」と示す（「0 秒ほど」と出さない）", async () => {
    for (const retryAfterSeconds of [0, -5, 0.2]) {
      const { text } = await submitAndReadAlert({ ok: false, reason: "rate_limited", retryAfterSeconds });
      expect(text, String(retryAfterSeconds)).toContain("1 秒ほど待って");
      expect(text).not.toContain("0 秒");
    }
  });

  it("Retry-After の待ち時間が有限でない・1 日を超えるなら、既定の文言（サーバの制限からの目安）に戻す（「Infinity 分」等と出さない）", async () => {
    for (const retryAfterSeconds of [Infinity, Number.NaN, 1e20, 24 * 60 * 60 + 1]) {
      const { text } = await submitAndReadAlert({ ok: false, reason: "rate_limited", retryAfterSeconds });
      expect(text, String(retryAfterSeconds)).toContain("1 分ほど待って");
      expect(text).not.toContain("Infinity");
      expect(text).not.toContain("NaN");
    }
  });

  it("通信の失敗は、サーバに接続できないと示す", async () => {
    const { text } = await submitAndReadAlert({ ok: false, reason: "network_error" });
    expect(text).toContain("サーバに接続できません");
  });

  it("それ以外の状態（400 等）は、状態の番号を添えて示す", async () => {
    const { text } = await submitAndReadAlert({ ok: false, reason: "http_error", status: 400 });
    expect(text).toContain("HTTP 400");
  });

  it("login() が万一 reject しても、接続できないと示す（例外を外へ漏らさない）", async () => {
    const conn = makeConn();
    conn.login.mockRejectedValue(new TypeError("Failed to fetch"));
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("some-token");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("サーバに接続できません");
  });

  it("もう一度送信すると、前の失敗の表示を消してからやり直す", async () => {
    const conn = makeConn();
    conn.login.mockResolvedValueOnce({ ok: false, reason: "origin_rejected" } satisfies LoginResult);
    let resolveSecond: (r: LoginResult) => void = () => undefined;
    conn.login.mockReturnValueOnce(new Promise<LoginResult>((r) => (resolveSecond = r)));
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("some-token");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false); // 応答待ちの間は前の失敗を出さない
    resolveSecond({ ok: true });
    await flushPromises();
    expect(conn.connect).toHaveBeenCalledTimes(1);
  });

  it("#token= での自動ログインが失敗しても、token は入力欄に残り、そのまま押し直せる（URL からは消した後なので失わない）", async () => {
    window.location.hash = "#token=hash-token-123";
    const conn = makeConn();
    conn.login.mockResolvedValueOnce({ ok: false, reason: "origin_rejected" } satisfies LoginResult);
    conn.login.mockResolvedValueOnce({ ok: true } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await flushPromises();
    expect(conn.login).toHaveBeenCalledWith("hash-token-123");
    expect(window.location.hash).toBe("");
    expect(wrapper.get('[role="alert"]').text()).toContain("token とは関係ありません");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("hash-token-123");
    expect(wrapper.get("button").attributes("disabled")).toBeUndefined();

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(conn.login).toHaveBeenLastCalledWith("hash-token-123");
    expect(conn.connect).toHaveBeenCalledTimes(1);
  });
});

/**
 * D105：ログインできた後、アプリの画面へ替わるまで（この画面は `authRequired` が下りる＝接続が `open` になるまで出たまま）は
 * 「接続中…」を出して入力を止める。以前は `/ws` が 503（サーバの起動の途中）の間、入力できる状態のまま何も表示せずに残っていた。
 */
describe("LoginView — ログインできた後の接続待ち（D105）", () => {
  async function loginOk() {
    const conn = makeConn();
    conn.login.mockResolvedValue({ ok: true } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("good-token");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    return { conn, wrapper };
  }

  it("ログインできたら「接続中…」を出し、入力欄とボタンを止める（もう一度送っても login を呼ばない）", async () => {
    const { conn, wrapper } = await loginOk();
    expect(conn.connect).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="status"]').text()).toContain("接続中…");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get("input").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(conn.login).toHaveBeenCalledTimes(1);
  });

  it("接続の確認で再び認証を求められたら（/api/session が 401・/ws が 4401 → onAuthRequired）、入力できる状態へ戻して理由を示す（止めたままにしない）", async () => {
    const { conn, wrapper } = await loginOk();
    useViewStore().onAuthRequired(); // Connection → StoreAdapter → view.onAuthRequired（authRequired は既に true のまま）
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toContain("ログインはできましたが");
    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();
    expect(wrapper.get("button").attributes("disabled")).toBeUndefined();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("good-token");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(conn.login).toHaveBeenCalledTimes(2); // 押し直せる
    expect(conn.connect).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toContain("接続中…");
  });

  it("接続待ちでないときの onAuthRequired では何も変えない（失敗の表示も出さない）", async () => {
    const conn = makeConn();
    const wrapper = mountLogin(conn);
    useViewStore().onAuthRequired();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();
  });

  it("ログインに失敗したときは「接続中…」を出さない", async () => {
    const conn = makeConn();
    conn.login.mockResolvedValue({ ok: false, reason: "bad_token" } satisfies LoginResult);
    const wrapper = mountLogin(conn);
    await wrapper.get("input").setValue("bad");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();
  });
});
