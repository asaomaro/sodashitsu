import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { buildExtensionEnv, EXTENSION_ENV_DROPPED, extensionArgv, killTreeCommand, safePath } from "./extensionLaunch.js";

describe("extensionArgv", () => {
  it("POSIX は /bin/sh -c（ログインシェルにしない・絶対パス）", () => {
    expect(extensionArgv("node a.mjs", "linux", {})).toEqual(["/bin/sh", "-c", "node a.mjs"]);
    expect(extensionArgv("x", "darwin", { SHELL: "/bin/zsh" })).toEqual(["/bin/sh", "-c", "x"]);
  });
  it("Windows は ComSpec（絶対パス）。無い・相対なら <SystemRoot>\\System32\\cmd.exe", () => {
    expect(extensionArgv('node "a b.mjs"', "win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual([
      "C:\\Windows\\System32\\cmd.exe",
      "/d",
      "/s",
      "/c",
      '"node "a b.mjs""',
    ]);
    // 大文字小文字を問わず引く
    expect(extensionArgv("x", "win32", { COMSPEC: "D:\\w\\cmd.exe" })[0]).toBe("D:\\w\\cmd.exe");
    // 無いとき・相対のとき: 絶対パスのシェル
    const none = extensionArgv("x", "win32", { SystemRoot: "D:\\WIN" })[0]!;
    expect(none).toBe("D:\\WIN\\System32\\cmd.exe");
    expect(win32.isAbsolute(none)).toBe(true);
    expect(extensionArgv("x", "win32", { ComSpec: "cmd.exe", SystemRoot: "D:\\WIN" })[0]).toBe("D:\\WIN\\System32\\cmd.exe");
    expect(win32.isAbsolute(extensionArgv("x", "win32", {})[0]!)).toBe(true);
    expect(extensionArgv("x", "win32", {})[0]).toBe("C:\\Windows\\System32\\cmd.exe");
  });
});

describe("killTreeCommand", () => {
  it("POSIX は null", () => {
    expect(killTreeCommand(1234, "linux", {})).toBeNull();
    expect(killTreeCommand(1234, "darwin", {})).toBeNull();
  });
  it("Windows は taskkill の絶対パスと、cwd が System32", () => {
    const r = killTreeCommand(1234, "win32", { SystemRoot: "D:\\WIN" })!;
    expect(r.file).toBe("D:\\WIN\\System32\\taskkill.exe");
    expect(r.cwd).toBe("D:\\WIN\\System32");
    expect(r.args).toEqual(["/pid", "1234", "/T", "/F"]);
    expect(win32.isAbsolute(r.file)).toBe(true);
  });
  it("SystemRoot が無ければ windir、どちらも無ければ C:\\Windows", () => {
    expect(killTreeCommand(1, "win32", { windir: "E:\\W" })!.file).toBe("E:\\W\\System32\\taskkill.exe");
    const d = killTreeCommand(1, "win32", {})!;
    expect(d.file).toBe("C:\\Windows\\System32\\taskkill.exe");
    expect(d.cwd).toBe("C:\\Windows\\System32");
  });
  it("環境変数の名前は大文字小文字を区別しない", () => {
    expect(killTreeCommand(1, "win32", { SYSTEMROOT: "F:\\X" })!.file).toBe("F:\\X\\System32\\taskkill.exe");
  });
});

describe("buildExtensionEnv", () => {
  const secrets = {
    SODACTL_TOKEN: "secret-token-123",
    SODACTL_URL: "http://elsewhere:1",
    SODA_PANE_ID: "pane-9",
    SODA_PANE_SOCKET: "/s/pane.sock",
    SODA_SERVER_URL: "http://old:2",
    SODA_AGENT_REPORT_SOCKET: "/s/agent-report.sock",
  };
  const base = { PATH: "/usr/bin", HOME: "/home/u", API_KEY: "user-key", ...secrets } as NodeJS.ProcessEnv;

  it("利用者: 落とす変数が無く、id・種類・runId が入る（SODA_PROJECT_ROOT は無い）", () => {
    const env = buildExtensionEnv(base, { id: "a", scope: "user", root: null, runId: "r1" }, "linux");
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/u", API_KEY: "user-key", SODA_EXTENSION_ID: "a", SODA_EXTENSION_SCOPE: "user", SODA_EXTENSION_RUN_ID: "r1" });
  });
  it("プロジェクト: SODA_PROJECT_ROOT が入る", () => {
    const env = buildExtensionEnv(base, { id: "a", scope: "project", root: "/r", runId: "r1" }, "linux");
    expect(env["SODA_PROJECT_ROOT"]).toBe("/r");
    expect(env["SODA_EXTENSION_SCOPE"]).toBe("project");
  });
  it("結果のどの値にも、token・pane id・受け口のパス・サーバの URL が含まれない", () => {
    for (const platform of ["linux", "win32"] as const) {
      const env = buildExtensionEnv(base, { id: "a", scope: "project", root: "/r", runId: "r1" }, platform);
      const all = Object.values(env).join("\n");
      for (const v of Object.values(secrets)) expect(all).not.toContain(v);
      for (const k of Object.keys(secrets)) expect(env[k]).toBeUndefined();
    }
  });
  it("base にある古い SODA_EXTENSION_* は、新しい値で上書きされる／プロジェクトでなければ SODA_PROJECT_ROOT は無い", () => {
    const env = buildExtensionEnv({ SODA_EXTENSION_ID: "old", SODA_PROJECT_ROOT: "/old", SODA_EXTENSION_RUN_ID: "old" }, { id: "a", scope: "user", root: null, runId: "r2" }, "linux");
    expect(env).toEqual({ SODA_EXTENSION_ID: "a", SODA_EXTENSION_SCOPE: "user", SODA_EXTENSION_RUN_ID: "r2" });
  });
  it("Windows は大文字小文字を区別せずに落とす", () => {
    const env = buildExtensionEnv({ Path: "x", sodactl_token: "t", Soda_Pane_Id: "p" }, { id: "a", scope: "user", root: null, runId: "r" }, "win32");
    expect(env["sodactl_token"]).toBeUndefined();
    expect(env["Soda_Pane_Id"]).toBeUndefined();
    expect(env["Path"]).toBe("x");
  });
  it("落とす一覧は、pane の落とす一覧を含む", () => {
    for (const k of ["SODACTL_TOKEN", "SODA_PANE_ID", "SODA_PANE_SOCKET", "SODA_SERVER_URL", "SODA_AGENT_REPORT_SOCKET", "SODA_EXTENSION_ID", "SODA_PROJECT_ROOT"]) {
      expect(EXTENSION_ENV_DROPPED).toContain(k);
    }
  });
});

describe("safePath・プロジェクトの PATH（D13 の 3）", () => {
  it("空の要素・.・相対の要素を落とし、絶対のものは順のまま残す", () => {
    expect(safePath(":/usr/bin:.:rel/bin:./x:/opt/x::", "linux")).toBe("/usr/bin:/opt/x");
    expect(safePath("", "linux")).toBe("");
    expect(safePath("/a:/b", "linux")).toBe("/a:/b");
    expect(safePath("C:\\Windows;;.;bin;D:\\tools", "win32")).toBe("C:\\Windows;D:\\tools");
  });
  it("プロジェクトだけ。利用者の PATH は変えない。Windows は大文字小文字を区別せずに PATH を見る", () => {
    const dirty = { PATH: ":/usr/bin:.:rel" } as NodeJS.ProcessEnv;
    expect(buildExtensionEnv(dirty, { id: "a", scope: "project", root: "/r", runId: "r" }, "linux")["PATH"]).toBe("/usr/bin");
    expect(buildExtensionEnv(dirty, { id: "a", scope: "user", root: null, runId: "r" }, "linux")["PATH"]).toBe(":/usr/bin:.:rel");
    const win = buildExtensionEnv({ Path: ";C:\\a;." } as NodeJS.ProcessEnv, { id: "a", scope: "project", root: "C:\\r", runId: "r" }, "win32");
    expect(win["Path"]).toBe("C:\\a");
  });
  it("PATH が無い環境では、PATH を作らない", () => {
    expect(buildExtensionEnv({}, { id: "a", scope: "project", root: "/r", runId: "r" }, "linux")["PATH"]).toBeUndefined();
  });
});

describe("PATH が全部落ちたとき（D14）", () => {
  it("空の文字列では渡さず、固定の安全な値にする（POSIX）。PATH が無ければ作らない", () => {
    for (const dirty of [".", ":", "rel/bin", "", "::.:rel"]) {
      const env = buildExtensionEnv({ PATH: dirty } as NodeJS.ProcessEnv, { id: "a", scope: "project", root: "/r", runId: "r" }, "linux");
      expect(env["PATH"], JSON.stringify(dirty)).toBe("/usr/local/bin:/usr/bin:/bin");
    }
    expect(buildExtensionEnv({ PATH: "." } as NodeJS.ProcessEnv, { id: "a", scope: "user", root: null, runId: "r" }, "linux")["PATH"]).toBe(".");
    expect(buildExtensionEnv({}, { id: "a", scope: "project", root: "/r", runId: "r" }, "linux")["PATH"]).toBeUndefined();
  });
  it("Windows は SystemRoot から（効くかは実機で確かめていない）", () => {
    const env = buildExtensionEnv({ Path: ".", SystemRoot: "C:\\Windows" } as NodeJS.ProcessEnv, { id: "a", scope: "project", root: "C:\\r", runId: "r" }, "win32");
    expect(env["Path"]).toBe("C:\\Windows\\System32;C:\\Windows");
  });
});
