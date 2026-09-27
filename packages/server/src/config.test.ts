import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULTS,
  agentReportSocketPathFor,
  bindFailureHint,
  defaultStateDir,
  isBindFailure,
  listenFailureHint,
  resolveServeOptions,
  stateDirInUseError,
} from "./config.js";

describe("resolveServeOptions", () => {
  it("uses defaults when nothing is given", () => {
    const opts = resolveServeOptions({});
    expect(opts.host).toBe(DEFAULTS.host);
    expect(opts.port).toBe(DEFAULTS.port);
    expect(opts.scrollbackLines).toBe(DEFAULTS.scrollbackLines);
  });

  it("allows a loopback host without a certificate", () => {
    expect(() => resolveServeOptions({ host: "127.0.0.1" })).not.toThrow();
    expect(() => resolveServeOptions({ host: "localhost" })).not.toThrow();
  });

  it("refuses a non-loopback host without a certificate", () => {
    expect(() => resolveServeOptions({ host: "0.0.0.0" })).toThrow(ConfigError);
    expect(() => resolveServeOptions({ host: "192.168.1.5" })).toThrow(ConfigError);
  });

  it("accepts a non-loopback host when cert and key are both given", () => {
    const opts = resolveServeOptions({ host: "0.0.0.0", cert: "c.pem", key: "k.pem" });
    expect(opts.cert).toBe("c.pem");
    expect(opts.key).toBe("k.pem");
  });

  it("refuses cert without key and vice versa", () => {
    expect(() => resolveServeOptions({ host: "127.0.0.1", cert: "c.pem" })).toThrow(ConfigError);
    expect(() => resolveServeOptions({ host: "127.0.0.1", key: "k.pem" })).toThrow(ConfigError);
  });

  it("caps scrollback at the maximum", () => {
    const opts = resolveServeOptions({ scrollback: "999999" });
    expect(opts.scrollbackLines).toBe(DEFAULTS.scrollbackLinesMax);
  });

  it("rejects a negative or non-numeric scrollback", () => {
    expect(() => resolveServeOptions({ scrollback: "-1" })).toThrow(ConfigError);
    expect(() => resolveServeOptions({ scrollback: "abc" })).toThrow(ConfigError);
  });

  it("paneHistory は既定で無効、--pane-history のときだけ有効（20260926-screen-history-replay の AC4）", () => {
    expect(resolveServeOptions({}).paneHistory).toBe(false);
    expect(resolveServeOptions({ paneHistory: true }).paneHistory).toBe(true);
  });

  it("worktreeDir は素通しする（既定値の解決はしない。20260924-worktree-dir-config）", () => {
    expect(resolveServeOptions({}).worktreeDir).toBeUndefined();
    expect(resolveServeOptions({ worktreeDir: "/custom/worktrees" }).worktreeDir).toBe("/custom/worktrees");
  });

  it("--host の角括弧付きの IPv6 は角括弧を外す（listen が名前として引いて落ちないように。D101）", () => {
    expect(resolveServeOptions({ host: "[::1]" }).host).toBe("::1");
    expect(resolveServeOptions({ host: "[::]", cert: "c.pem", key: "k.pem" }).host).toBe("::");
  });

  it("--origin はブラウザが送る Origin と同じ形にそろえ、Origin でないものは拒む（D101）", () => {
    const opts = resolveServeOptions({ origin: ["https://My.Tailnet.ts.net:443/", "http://x.example:7780"] });
    expect(opts.extraOrigins).toEqual(["https://my.tailnet.ts.net", "http://x.example:7780"]);
    expect(() => resolveServeOptions({ origin: ["my.tailnet.ts.net"] })).toThrow(ConfigError);
    expect(() => resolveServeOptions({ origin: ["ftp://x.example"] })).toThrow(ConfigError);
  });

  it("rejects an out-of-range port", () => {
    expect(() => resolveServeOptions({ port: "0" })).toThrow(ConfigError);
    expect(() => resolveServeOptions({ port: "70000" })).toThrow(ConfigError);
  });
});

describe("defaultStateDir", () => {
  it("uses %LOCALAPPDATA% on Windows", () => {
    const dir = defaultStateDir({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32");
    expect(dir).toContain("sodashitsu");
    expect(dir.startsWith("C:\\Users\\u\\AppData\\Local")).toBe(true);
  });

  it("uses XDG_STATE_HOME on Linux", () => {
    const dir = defaultStateDir({ XDG_STATE_HOME: "/home/u/.local/state" }, "linux");
    expect(dir).toBe("/home/u/.local/state/sodashitsu");
  });
});

describe("resolveServeOptions の名前付き session（20260926-named-session）", () => {
  const env = { XDG_STATE_HOME: "/home/u/.local/state" };
  const base = "/home/u/.local/state/sodashitsu";

  it("--session が無い・default なら既定の状態ディレクトリ（今までどおり）で、sessionName は undefined", () => {
    expect(resolveServeOptions({}, env, "linux")).toMatchObject({ stateDir: base, sessionName: undefined });
    expect(resolveServeOptions({ session: "default" }, env, "linux")).toMatchObject({ stateDir: base, sessionName: undefined });
    expect(resolveServeOptions({ stateDir: "/s" }, env, "linux")).toMatchObject({ stateDir: "/s", sessionName: undefined });
  });

  it("--session work は <既定>/sessions/work、--state-dir D と併せると D/sessions/work", () => {
    expect(resolveServeOptions({ session: "work" }, env, "linux")).toMatchObject({
      stateDir: join(base, "sessions", "work"),
      sessionName: "work",
    });
    expect(resolveServeOptions({ stateDir: "/s", session: "work" }, env, "linux").stateDir).toBe(join("/s", "sessions", "work"));
  });

  it("規則外の名前は ConfigError", () => {
    for (const bad of ["..", "../x", "a/b", "", "con", "-x"]) {
      expect(() => resolveServeOptions({ session: bad }, env, "linux"), bad).toThrow(ConfigError);
    }
  });

  it("公式フック連携の socket のパスが上限を超えると ConfigError（Linux は 108 バイトまで通す。macOS 等は 103）", () => {
    const dirFor = (bytes: number): string => "/" + "d".repeat(bytes - "/".length - "/agent-report.sock".length);
    expect(Buffer.byteLength(agentReportSocketPathFor(dirFor(108), "linux"))).toBe(108);
    expect(() => resolveServeOptions({ stateDir: dirFor(108) }, env, "linux")).not.toThrow();
    expect(() => resolveServeOptions({ stateDir: dirFor(109) }, env, "linux")).toThrow(/too long/);
    expect(() => resolveServeOptions({ stateDir: dirFor(103) }, env, "darwin")).not.toThrow();
    expect(() => resolveServeOptions({ stateDir: dirFor(104) }, env, "darwin")).toThrow(ConfigError);
    // Windows は named pipe（パスの長さに依らない）ので検査しない
    expect(() => resolveServeOptions({ stateDir: dirFor(300) }, env, "win32")).not.toThrow();
  });

  it("案内は --state-dir を短くすることを示し、名前付き session のときだけ --session を短くすることも示す", () => {
    const hintOf = (args: Parameters<typeof resolveServeOptions>[0]): string => {
      try {
        resolveServeOptions(args, env, "linux");
      } catch (err) {
        return (err as ConfigError).hint;
      }
      throw new Error("no ConfigError");
    };
    const plain = hintOf({ stateDir: "/" + "d".repeat(200) });
    expect(plain).toContain("--state-dir に短いパス");
    expect(plain).not.toContain("--session"); // 既定の session に --session を足すとパスは長くなる
    const named = hintOf({ stateDir: "/" + "d".repeat(60), session: "x".repeat(40) });
    expect(named).toContain("--session に短い名前");
    expect(named).toContain("--state-dir に短いパス");
  });
});

describe("listenFailureHint（待ち受けの失敗の案内。D102）", () => {
  it("ポートが使用中：--port と、並行して動かすなら --state-dir も分けることを案内する", () => {
    const hint = listenFailureHint("EADDRINUSE");
    expect(hint).toContain("別のプロセスが使っています");
    expect(hint).toContain("--state-dir");
    expect(hint).toContain("--port");
    // 同じ state-dir の 2 つ目はポートを変えても soda.lock で止まる（D103）ので、state-dir も分けるよう添える
    expect(hint).toContain("並行して動かすなら --state-dir も分け");
    expect(hint).toContain("--session <名前>"); // 20260926-named-session
  });

  it("権限なし：Linux の 1024 未満のポートと、Windows の除外ポート範囲を案内する", () => {
    const hint = listenFailureHint("EACCES");
    expect(hint).toContain("1024");
    expect(hint).toContain("netsh interface ipv4 show excludedportrange protocol=tcp");
  });

  it("このマシンに無いアドレス・解決できない名前：--host を案内する", () => {
    expect(listenFailureHint("EADDRNOTAVAIL")).toContain("--host");
    expect(listenFailureHint("ENOTFOUND")).toContain("--host");
    // 名前解決の一時的な失敗（getaddrinfo の EAI_AGAIN）も ENOTFOUND と同じ扱い
    expect(listenFailureHint("EAI_AGAIN")).toBe(listenFailureHint("ENOTFOUND"));
  });

  it("待ち受けの設定で直せない失敗には案内を返さない（呼び出し側が投げ直す）", () => {
    expect(listenFailureHint("EMFILE")).toBeUndefined();
    expect(listenFailureHint(undefined)).toBeUndefined();
  });
});

/** `net.Server.listen` が 'error' で渡すものと同じ形（`syscall`・`code` 付きの Error）。 */
function sysError(syscall: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${syscall} ${code}`), { syscall, code });
}

describe("isBindFailure / bindFailureHint（待ち受けの失敗の判定を 1 か所に。D103）", () => {
  it("bind・名前解決の段階の失敗（syscall が listen・bind・getaddrinfo）だけを拾い、案内を返す", () => {
    expect(isBindFailure(sysError("listen", "EADDRINUSE"))).toBe(true);
    expect(bindFailureHint(sysError("listen", "EADDRINUSE"))).toBe(listenFailureHint("EADDRINUSE"));
    expect(bindFailureHint(sysError("bind", "EACCES"))).toBe(listenFailureHint("EACCES"));
    expect(bindFailureHint(sysError("listen", "EADDRNOTAVAIL"))).toBe(listenFailureHint("EADDRNOTAVAIL"));
    expect(bindFailureHint(sysError("getaddrinfo", "ENOTFOUND"))).toBe(listenFailureHint("ENOTFOUND"));
    expect(bindFailureHint(sysError("getaddrinfo", "EAI_AGAIN"))).toBe(listenFailureHint("ENOTFOUND"));
  });

  it("bind の後の失敗（状態ディレクトリの書き込みの EACCES 等）を「ポートの権限」と取り違えない", () => {
    expect(isBindFailure(sysError("open", "EACCES"))).toBe(false);
    expect(bindFailureHint(sysError("open", "EACCES"))).toBeUndefined();
    expect(bindFailureHint(sysError("rename", "EACCES"))).toBeUndefined();
  });

  it("bind の段階でも案内の無い失敗・Error でないもの・ConfigError には案内を返さない（呼び出し側が投げ直す）", () => {
    expect(bindFailureHint(sysError("listen", "EMFILE"))).toBeUndefined();
    expect(bindFailureHint(new Error("failed to start a shell"))).toBeUndefined();
    expect(bindFailureHint(new ConfigError("x", "y"))).toBeUndefined();
    expect(bindFailureHint(undefined)).toBeUndefined();
    expect(bindFailureHint({ syscall: "listen", code: "EADDRINUSE" })).toBeUndefined(); // Error でない
  });
});

describe("stateDirInUseError（同じ state-dir の二重起動。D103）", () => {
  const inUse = { pid: 4242, lockPath: "/s/soda.lock" };

  it("serve：使っている pid と、別の --state-dir を指定する案内・pid の再利用ならロックを消す案内", () => {
    const err = stateDirInUseError(inUse, "/s", "serve");
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain("/s");
    expect(err.message).toContain("pid 4242");
    expect(err.hint).toContain("--state-dir に別のディレクトリ");
    expect(err.hint).toContain("--session <名前> で別の名前付き session"); // 20260926-named-session
    expect(err.hint).toContain("/s/soda.lock を消して");
  });

  it("持ち主が別のホスト（別のコンテナ）なら、そのホスト名と、動いていなければロックを消す案内を出す（D103 の独立点検 #2）", () => {
    const err = stateDirInUseError({ ...inUse, otherHost: "container-b" }, "/s", "serve");
    expect(err.message).toContain("pid 4242 on container-b");
    expect(err.hint).toContain("container-b");
    expect(err.hint).toContain("/s/soda.lock を消して");
  });

  it("token reset：動いている soda serve を止めてから実行するよう案内する", () => {
    const err = stateDirInUseError(inUse, "/s", "token-reset");
    expect(err.message).toContain("pid 4242");
    expect(err.hint).toContain("soda serve を止めてから soda token reset");
  });
});

/** 20260926-named-session-ui（AC13・AC16）。 */
describe("resolveServeOptions の session の根・出所・ポートの出所（20260926-named-session-ui）", () => {
  const env = { XDG_STATE_HOME: "/xdg" } as NodeJS.ProcessEnv;

  it("session の根は --state-dir か既定の場所（名前付きでも根は変わらない）", () => {
    expect(resolveServeOptions({ stateDir: "/s", session: "work" }, env, "linux").sessionRoot).toBe("/s");
    expect(resolveServeOptions({}, env, "linux").sessionRoot).toBe(join("/xdg", "sodashitsu"));
    expect(resolveServeOptions({ session: "work" }, env, "linux").sessionRoot).toBe(join("/xdg", "sodashitsu"));
  });

  it("名前の出所は名前付きのときだけ（無指定は flag。default は既定なので undefined）", () => {
    expect(resolveServeOptions({ stateDir: "/s", session: "work" }, env, "linux").sessionSource).toBe("flag");
    expect(resolveServeOptions({ stateDir: "/s", session: "work", sessionSource: "env" }, env, "linux").sessionSource).toBe("env");
    expect(resolveServeOptions({ stateDir: "/s", session: "default", sessionSource: "env" }, env, "linux").sessionSource).toBeUndefined();
    expect(resolveServeOptions({ stateDir: "/s" }, env, "linux").sessionSource).toBeUndefined();
  });

  it("ポートの出所：--port は flag、無ければ default（記録で差し替えるのは composeServer）", () => {
    expect(resolveServeOptions({ port: "9000" }, env, "linux").portSource).toBe("flag");
    expect(resolveServeOptions({}, env, "linux").portSource).toBe("default");
    expect(resolveServeOptions({ session: "work" }, env, "linux").portSource).toBe("default");
  });
});

describe("bindFailureHint の記録したポートの案内（20260926-named-session-ui の AC16）", () => {
  it("記録したポートなら、その旨と --port を先に添える（元の案内も残す）", () => {
    const hint = bindFailureHint(sysError("listen", "EADDRINUSE"), { port: 7781, sessionName: "work" });
    expect(hint).toContain("ポート 7781 は session work が前回使ったポート");
    expect(hint).toContain("--port で別のポートを指定すると、次からはそのポートを使います");
    expect(hint!.endsWith(listenFailureHint("EADDRINUSE")!)).toBe(true);
  });

  it("記録を渡さなければ今までどおり。案内の無い失敗には添えない", () => {
    expect(bindFailureHint(sysError("listen", "EADDRINUSE"), undefined)).toBe(listenFailureHint("EADDRINUSE"));
    expect(bindFailureHint(sysError("listen", "EMFILE"), { port: 7781, sessionName: "work" })).toBeUndefined();
    expect(bindFailureHint(sysError("open", "EACCES"), { port: 7781, sessionName: "work" })).toBeUndefined();
  });
});

describe("stateDirInUseError の SODA_SESSION の案内（20260926-named-session-ui の AC14）", () => {
  const inUse = { pid: 4242, lockPath: "/s/soda.lock" };
  it("SODA_SESSION から選んだ名前付き session なら、その旨と --session default を添える", () => {
    for (const command of ["serve", "token-reset"] as const) {
      const err = stateDirInUseError(inUse, "/s", command, "work");
      expect(err.hint).toContain("session work は環境変数 SODA_SESSION から選びました");
      expect(err.hint).toContain("--session default");
    }
  });
  it("渡さなければ添えない（今までどおり）", () => {
    expect(stateDirInUseError(inUse, "/s", "serve").hint).not.toContain("SODA_SESSION");
    expect(stateDirInUseError(inUse, "/s", "token-reset").hint).not.toContain("SODA_SESSION");
  });
});
