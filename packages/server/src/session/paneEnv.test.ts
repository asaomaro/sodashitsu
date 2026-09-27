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
