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
