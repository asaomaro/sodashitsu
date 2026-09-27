import { describe, expect, it } from "vitest";
import { buildPaneEnv } from "./paneEnv.js";

/** 20260926-agent-skill-file（AC9・AC15）。 */
describe("buildPaneEnv", () => {
  const inherited = {
    PATH: "/usr/bin",
    HOME: "/home/u",
    WTMCTL_URL: "http://elsewhere:1",
    WTMCTL_TOKEN: "secret-token-123",
    WTM_PANE_ID: "p99",
    WTM_SERVER_URL: "http://old:2",
    WTM_AGENT_REPORT_SOCKET: "/old/agent-report.sock",
    WTM_SESSION: "inherited",
    WTM_HANDOFF_NONCE: "0123456789abcdef", // 20260926-live-handoff: 引き継ぎの nonce も pane へは渡さない
    UNSET: undefined,
  } as NodeJS.ProcessEnv;

  it("受け継いだ wtmctl の設定と古い WTM_* を消し、サーバの値を入れる（利用者の変数は写す）", () => {
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
      WTM_PANE_ID: "p1",
      WTM_SERVER_URL: "http://127.0.0.1:7780",
      WTM_AGENT_REPORT_SOCKET: "/s/agent-report.sock",
    });
  });

  it("URL・socket が無ければ入れない（受け継いだ古い値も残さない）", () => {
    const env = buildPaneEnv(inherited, { paneId: "p1" }, "linux");
    expect(env["WTM_PANE_ID"]).toBe("p1");
    expect("WTM_SERVER_URL" in env).toBe(false);
    expect("WTM_AGENT_REPORT_SOCKET" in env).toBe(false);
    expect("WTMCTL_URL" in env).toBe(false);
  });

  it("token はどの値にも含まれない（AC15）", () => {
    const env = buildPaneEnv(
      inherited,
      { paneId: "p1", serverUrl: "http://127.0.0.1:7780" },
      "linux",
    );
    expect(Object.values(env).some((v) => v.includes("secret-token-123"))).toBe(false);
    expect(Object.keys(env).some((k) => k.toUpperCase() === "WTMCTL_TOKEN")).toBe(false);
  });

  it("小文字の変種: win32 では消え、linux では残る（利用者の別の変数）", () => {
    const base = { wtmctl_token: "t", Wtm_Pane_Id: "p9", other: "x" } as NodeJS.ProcessEnv;
    expect(buildPaneEnv(base, { paneId: "p1" }, "win32")).toEqual({
      other: "x",
      WTM_PANE_ID: "p1",
    });
    expect(buildPaneEnv(base, { paneId: "p1" }, "linux")).toEqual({
      wtmctl_token: "t",
      Wtm_Pane_Id: "p9",
      other: "x",
      WTM_PANE_ID: "p1",
    });
  });

  it("base を変えない", () => {
    const base = { WTMCTL_TOKEN: "t" } as NodeJS.ProcessEnv;
    buildPaneEnv(base, { paneId: "p1" }, "linux");
    expect(base).toEqual({ WTMCTL_TOKEN: "t" });
  });
});

/** 20260926-named-session-ui（AC15）。 */
describe("buildPaneEnv の WTM_SESSION", () => {
  it("名前付き session なら WTM_SESSION に入れる（受け継いだ別の値より勝つ）", () => {
    const env = buildPaneEnv(
      { PATH: "/usr/bin", WTM_SESSION: "other" } as NodeJS.ProcessEnv,
      { paneId: "p1", sessionName: "work" },
      "linux",
    );
    expect(env["WTM_SESSION"]).toBe("work");
  });

  it("既定の session では入れず、受け継いだ値も渡さない", () => {
    const env = buildPaneEnv(
      { PATH: "/usr/bin", WTM_SESSION: "work" } as NodeJS.ProcessEnv,
      { paneId: "p1" },
      "linux",
    );
    expect("WTM_SESSION" in env).toBe(false);
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("win32 では大文字小文字を区別せずに落とし、linux では別の変数として残す", () => {
    const base = { Wtm_Session: "x", wtm_session: "y" } as NodeJS.ProcessEnv;
    expect(buildPaneEnv(base, { paneId: "p1", sessionName: "work" }, "win32")).toEqual({
      WTM_PANE_ID: "p1",
      WTM_SESSION: "work",
    });
    expect(buildPaneEnv(base, { paneId: "p1" }, "linux")).toEqual({
      Wtm_Session: "x",
      wtm_session: "y",
      WTM_PANE_ID: "p1",
    });
  });
});

describe("buildPaneEnv の独自コマンド（20260927-custom-command-keys の AC10）", () => {
  const base = {
    PATH: "/usr/bin",
    WTMCTL_TOKEN: "secret",
    WTMCTL_URL: "http://x",
    WTM_ACTIVE_PANE_ID: "p-old",
    WTM_ACTIVE_WORKSPACE_ID: "w-old",
    WTM_ACTIVE_TAB_ID: "t-old",
    WTM_ACTIVE_PANE_CWD: "/old",
    WTM_COMMAND_ID: "old",
  };

  it("paneId を省くと WTM_PANE_ID を入れない（popup・裏での実行）", () => {
    const env = buildPaneEnv(
      { ...base, WTM_PANE_ID: "p-inherited" },
      { extra: { WTM_ACTIVE_PANE_ID: "p1" } },
    );
    expect(env["WTM_PANE_ID"]).toBeUndefined();
    expect(env["WTM_ACTIVE_PANE_ID"]).toBe("p1");
  });

  it("extra を足し、受け継いだ古い WTM_ACTIVE_*・WTM_COMMAND_ID・wtmctl の設定は落とす", () => {
    const env = buildPaneEnv(base, { paneId: "p2", extra: { WTM_COMMAND_ID: "build" } });
    expect(env).toEqual({ PATH: "/usr/bin", WTM_PANE_ID: "p2", WTM_COMMAND_ID: "build" });
  });

  it("extra が無ければ今までと同じ（古い WTM_ACTIVE_* は普通の pane にも渡さない）", () => {
    expect(buildPaneEnv(base, { paneId: "p3" })).toEqual({ PATH: "/usr/bin", WTM_PANE_ID: "p3" });
  });
});
