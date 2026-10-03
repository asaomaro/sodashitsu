import { describe, expect, it } from "vitest";
import { buildPaneEnv } from "./paneEnv.js";

/** 20260926-agent-skill-file（AC9・AC15）。 */
describe("buildPaneEnv", () => {
  const inherited = {
    PATH: "/usr/bin",
    HOME: "/home/u",
    SODACTL_URL: "http://elsewhere:1",
    SODACTL_TOKEN: "secret-token-123",
    SODA_PANE_ID: "p99",
    SODA_SERVER_URL: "http://old:2",
    SODA_AGENT_REPORT_SOCKET: "/old/agent-report.sock",
    SODA_SESSION: "inherited",
    SODA_HANDOFF_NONCE: "0123456789abcdef", // 20260926-live-handoff: 引き継ぎの nonce も pane へは渡さない
    UNSET: undefined,
  } as NodeJS.ProcessEnv;

  it("受け継いだ sodactl の設定と古い SODA_* を消し、サーバの値を入れる（利用者の変数は写す）", () => {
    const env = buildPaneEnv(
      inherited,
      {
        paneId: "p1",
        serverUrl: "http://127.0.0.1:7780",
        agentReportSocketPath: "/s/agent-report.sock",
      },
      "linux",
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/u",
      SODA_PANE_ID: "p1",
      SODA_SERVER_URL: "http://127.0.0.1:7780",
      SODA_AGENT_REPORT_SOCKET: "/s/agent-report.sock",
    });
  });

  it("URL・socket が無ければ入れない（受け継いだ古い値も残さない）", () => {
    const env = buildPaneEnv(inherited, { paneId: "p1" }, "linux");
    expect(env["SODA_PANE_ID"]).toBe("p1");
    expect("SODA_SERVER_URL" in env).toBe(false);
    expect("SODA_AGENT_REPORT_SOCKET" in env).toBe(false);
    expect("SODACTL_URL" in env).toBe(false);
  });

  it("token はどの値にも含まれない（AC15）", () => {
    const env = buildPaneEnv(
      inherited,
      { paneId: "p1", serverUrl: "http://127.0.0.1:7780" },
      "linux",
    );
    expect(Object.values(env).some((v) => v.includes("secret-token-123"))).toBe(false);
    expect(Object.keys(env).some((k) => k.toUpperCase() === "SODACTL_TOKEN")).toBe(false);
  });

  it("小文字の変種: win32 では消え、linux では残る（利用者の別の変数）", () => {
    const base = { sodactl_token: "t", Soda_Pane_Id: "p9", other: "x" } as NodeJS.ProcessEnv;
    expect(buildPaneEnv(base, { paneId: "p1" }, "win32")).toEqual({
      other: "x",
      SODA_PANE_ID: "p1",
    });
    expect(buildPaneEnv(base, { paneId: "p1" }, "linux")).toEqual({
      sodactl_token: "t",
      Soda_Pane_Id: "p9",
      other: "x",
      SODA_PANE_ID: "p1",
    });
  });

  it("base を変えない", () => {
    const base = { SODACTL_TOKEN: "t" } as NodeJS.ProcessEnv;
    buildPaneEnv(base, { paneId: "p1" }, "linux");
    expect(base).toEqual({ SODACTL_TOKEN: "t" });
  });
});

/** 20260926-named-session-ui（AC15）。 */
describe("buildPaneEnv の SODA_SESSION", () => {
  it("名前付き session なら SODA_SESSION に入れる（受け継いだ別の値より勝つ）", () => {
    const env = buildPaneEnv(
      { PATH: "/usr/bin", SODA_SESSION: "other" } as NodeJS.ProcessEnv,
      { paneId: "p1", sessionName: "work" },
      "linux",
    );
    expect(env["SODA_SESSION"]).toBe("work");
  });

  it("既定の session では入れず、受け継いだ値も渡さない", () => {
    const env = buildPaneEnv(
      { PATH: "/usr/bin", SODA_SESSION: "work" } as NodeJS.ProcessEnv,
      { paneId: "p1" },
      "linux",
    );
    expect("SODA_SESSION" in env).toBe(false);
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("win32 では大文字小文字を区別せずに落とし、linux では別の変数として残す", () => {
    const base = { Soda_Session: "x", soda_session: "y" } as NodeJS.ProcessEnv;
    expect(buildPaneEnv(base, { paneId: "p1", sessionName: "work" }, "win32")).toEqual({
      SODA_PANE_ID: "p1",
      SODA_SESSION: "work",
    });
    expect(buildPaneEnv(base, { paneId: "p1" }, "linux")).toEqual({
      Soda_Session: "x",
      soda_session: "y",
      SODA_PANE_ID: "p1",
    });
  });
});

describe("buildPaneEnv の独自コマンド（20260927-custom-command-keys の AC10）", () => {
  const base = {
    PATH: "/usr/bin",
    SODACTL_TOKEN: "secret",
    SODACTL_URL: "http://x",
    SODA_ACTIVE_PANE_ID: "p-old",
    SODA_ACTIVE_WORKSPACE_ID: "w-old",
    SODA_ACTIVE_TAB_ID: "t-old",
    SODA_ACTIVE_PANE_CWD: "/old",
    SODA_COMMAND_ID: "old",
  };

  it("paneId を省くと SODA_PANE_ID を入れない（popup・裏での実行）", () => {
    const env = buildPaneEnv(
      { ...base, SODA_PANE_ID: "p-inherited" },
      { extra: { SODA_ACTIVE_PANE_ID: "p1" } },
    );
    expect(env["SODA_PANE_ID"]).toBeUndefined();
    expect(env["SODA_ACTIVE_PANE_ID"]).toBe("p1");
  });

  it("extra を足し、受け継いだ古い SODA_ACTIVE_*・SODA_COMMAND_ID・sodactl の設定は落とす", () => {
    const env = buildPaneEnv(base, { paneId: "p2", extra: { SODA_COMMAND_ID: "build" } });
    expect(env).toEqual({ PATH: "/usr/bin", SODA_PANE_ID: "p2", SODA_COMMAND_ID: "build" });
  });

  it("extra が無ければ今までと同じ（古い SODA_ACTIVE_* は普通の pane にも渡さない）", () => {
    expect(buildPaneEnv(base, { paneId: "p3" })).toEqual({ PATH: "/usr/bin", SODA_PANE_ID: "p3" });
  });
});

/** 20261003-sodactl-ask-socket（AC5・AC15）。 */
describe("buildPaneEnv の SODA_PANE_SOCKET", () => {
  // token はサーバの環境に `SODACTL_TOKEN` として居る場合を置く。cookie と `local-auth.json` の秘密は `buildPaneEnv` に受け取る口が無い——
  // 口が増えていないこと（サーバが入れるキーが決まったものだけで、受け口で増えるのがパス 1 つであること）を最後のテストで見る。
  const TOKEN = "secret-token-123";
  const inherited = {
    PATH: "/usr/bin",
    SODACTL_TOKEN: TOKEN,
    SODACTL_URL: "http://elsewhere:1",
    SODA_PANE_SOCKET: "/old/pane.sock",
    SODA_AGENT_REPORT_SOCKET: "/old/agent-report.sock",
  } as NodeJS.ProcessEnv;

  it("パスがあれば SODA_PANE_SOCKET に入れる（受け継いだ古い値より勝つ）", () => {
    const env = buildPaneEnv(inherited, { paneId: "p1", paneSocketPath: "/s/pane.sock" }, "linux");
    expect(env["SODA_PANE_SOCKET"]).toBe("/s/pane.sock");
  });

  it("パスが無ければ入れず、親の環境の古い値も渡さない（Windows のサーバ・受け口の無いサーバ）", () => {
    for (const managed of [{ paneId: "p1" }, { paneId: "p1", paneSocketPath: undefined }, { paneId: "p1", paneSocketPath: "" }]) {
      const env = buildPaneEnv(inherited, managed, "linux");
      expect("SODA_PANE_SOCKET" in env, JSON.stringify(managed)).toBe(false);
      expect(Object.values(env)).not.toContain("/old/pane.sock");
    }
    // 独自コマンドの popup・裏での実行（paneId なし）でも同じ
    expect("SODA_PANE_SOCKET" in buildPaneEnv(inherited, {})).toBe(false);
  });

  it("win32 では大文字小文字を区別せずに古い値を落とし、linux では別の変数として残す", () => {
    const base = { Soda_Pane_Socket: "/old/pane.sock", other: "x" } as NodeJS.ProcessEnv;
    // Windows のサーバは受け口のパスを持たない（`paneSocketPathFor` が undefined）ので、入れる値も無い
    expect(buildPaneEnv(base, { paneId: "p1", paneSocketPath: undefined }, "win32")).toEqual({ other: "x", SODA_PANE_ID: "p1" });
    expect(buildPaneEnv(base, { paneId: "p1", paneSocketPath: "/s/pane.sock" }, "linux")).toEqual({
      Soda_Pane_Socket: "/old/pane.sock",
      other: "x",
      SODA_PANE_ID: "p1",
      SODA_PANE_SOCKET: "/s/pane.sock",
    });
  });

  it("受け口を足しても増えるのは SODA_PANE_SOCKET（パスだけ）で、token・cookie・local-auth.json の秘密はどの値にも含まれない（AC15）", () => {
    const managed = { paneId: "p1", serverUrl: "http://127.0.0.1:7780", agentReportSocketPath: "/s/agent-report.sock", sessionName: "work" };
    const before = buildPaneEnv(inherited, managed, "linux");
    const after = buildPaneEnv(inherited, { ...managed, paneSocketPath: "/s/pane.sock" }, "linux");
    // 増えるのは 1 つだけで、値は渡したパスそのもの（秘密を足す余地が無い）
    expect(after).toEqual({ ...before, SODA_PANE_SOCKET: "/s/pane.sock" });
    // サーバが入れるキーは決まったものだけ（token・cookie・local-auth.json の秘密を運ぶ変数が増えていない）
    expect(Object.keys(after).filter((k) => /^SODA(CTL)?_/.test(k)).sort()).toEqual([
      "SODA_AGENT_REPORT_SOCKET",
      "SODA_PANE_ID",
      "SODA_PANE_SOCKET",
      "SODA_SERVER_URL",
      "SODA_SESSION",
    ]);
    expect(Object.values(after).some((v) => v.includes(TOKEN))).toBe(false);
    expect(Object.keys(after).some((k) => /token|cookie|secret|auth/i.test(k))).toBe(false);
    expect(Object.values(after).some((v) => /local-auth\.json|soda_session=|token=/i.test(v))).toBe(false);
  });
});
