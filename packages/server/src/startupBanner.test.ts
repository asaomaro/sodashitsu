import { describe, expect, it } from "vitest";
import { lastChanceTokenLines, startupLines } from "./startupBanner.js";

const base = { scheme: "https" as const, port: 8443, extraOrigins: [], lanAddresses: ["192.168.1.50"] };

describe("startupLines（起動時の表示。D101・D102・D103）", () => {
  it("token を作ったときは、開ける URL ごとに #token= を付け、今だけ表示する旨を添える", () => {
    const lines = startupLines({ ...base, host: "0.0.0.0", freshToken: "TOK" });
    expect(lines).toEqual([
      "soda: listening on 0.0.0.0 port 8443 (https)",
      "soda: open https://localhost:8443/#token=TOK",
      "soda: open https://192.168.1.50:8443/#token=TOK",
      "soda: (token 付きの URL は今だけ表示します)",
    ]);
  });

  it("token を作っていなければ URL だけと、token reset の案内", () => {
    const lines = startupLines({ ...base, host: "127.0.0.1", scheme: "http", port: 7780, freshToken: undefined });
    expect(lines).toEqual([
      "soda: listening on 127.0.0.1 port 7780 (http)",
      "soda: open http://127.0.0.1:7780/",
      "soda: token を忘れた場合は「soda token reset」で作り直せます",
    ]);
  });

  it("--pane-history なら listening（と session）の次の行に、画面履歴を保存することと保存先を出す（20260926-screen-history-replay の AC11）", () => {
    const lines = startupLines({
      ...base,
      host: "127.0.0.1",
      scheme: "http",
      port: 7780,
      freshToken: undefined,
      session: { name: "work", stateDir: "/s/sessions/work" },
      paneHistoryPath: "/s/sessions/work/session-history.json",
    });
    expect(lines.slice(0, 3)).toEqual([
      "soda: listening on 127.0.0.1 port 7780 (http)",
      "soda: session work（状態ディレクトリ: /s/sessions/work）",
      "soda: 画面履歴を保存します（--pane-history）: /s/sessions/work/session-history.json。pane の出力（秘密を含みうる）がディスクに残ります",
    ]);
    // 無ければ出さない。
    expect(startupLines({ ...base, host: "127.0.0.1", scheme: "http", port: 7780, freshToken: undefined }).join("\n")).not.toContain("画面履歴");
  });

  it("名前付き session なら listening の次の行に session 名と状態ディレクトリを出す（20260926-named-session）", () => {
    const lines = startupLines({
      ...base,
      host: "127.0.0.1",
      scheme: "http",
      port: 7781,
      freshToken: undefined,
      session: { name: "work", stateDir: "/s/sessions/work" },
    });
    expect(lines).toEqual([
      "soda: listening on 127.0.0.1 port 7781 (http)",
      "soda: session work（状態ディレクトリ: /s/sessions/work）",
      "soda: open http://127.0.0.1:7781/",
      "soda: token を忘れた場合は「soda token reset --session work」で作り直せます",
    ]);
    // token を作った初回（URL あり・URL が組み立てられない）でも listening の直後に出す
    const session = { name: "work", stateDir: "/s/sessions/work" };
    expect(startupLines({ ...base, host: "0.0.0.0", freshToken: "TOK", session }).slice(0, 3)).toEqual([
      "soda: listening on 0.0.0.0 port 8443 (https)",
      "soda: session work（状態ディレクトリ: /s/sessions/work）",
      "soda: open https://localhost:8443/#token=TOK",
    ]);
    expect(startupLines({ ...base, host: "fe80::1%eth0", freshToken: "TOK", session })[1]).toBe("soda: session work（状態ディレクトリ: /s/sessions/work）");
    expect(lastChanceTokenLines("TOK", session)[1]).toContain("「soda token reset --session work」");
    // --state-dir を渡して起動したなら、その絶対パスも付ける（session は --state-dir と名前の組で決まる）。記号を含めば単一引用符で
    // 囲む（二重引用符だと bash が $ やバッククォートを展開して別の場所を指す）
    const withDir = (dir: string) => ({ ...session, stateDirBase: dir });
    expect(lastChanceTokenLines("TOK", withDir("/data/soda"))[1]).toContain("「soda token reset --state-dir /data/soda --session work」");
    expect(startupLines({ ...base, host: "127.0.0.1", freshToken: undefined, session: withDir("/my dir") }).at(-1)).toBe(
      "soda: token を忘れた場合は「soda token reset --state-dir '/my dir' --session work」で作り直せます",
    );
    expect(lastChanceTokenLines("TOK", withDir("/tmp/a$HOME`x`"))[1]).toContain("--state-dir '/tmp/a$HOME`x`' --session work");
    expect(lastChanceTokenLines("TOK", withDir("/tmp/it's"))[1]).toContain("--state-dir '/tmp/it'\\''s' --session work");
    expect(lastChanceTokenLines("TOK", withDir("C:\\Users\\me\\soda"))[1]).toContain("--state-dir 'C:\\Users\\me\\soda' --session work");
    expect(lastChanceTokenLines("TOK")[1]).toContain("「soda token reset」");
  });

  it("ゾーン付きの IPv6（URL にできない）で待ち受けても投げず、作った token を表示する（以前は Invalid URL で token を失った）", () => {
    const lines = startupLines({ ...base, host: "fe80::1%eth0", freshToken: "TOK" });
    expect(lines[0]).toBe("soda: listening on [fe80::1%eth0] port 8443 (https)");
    expect(lines.some((l) => l.startsWith("soda: open "))).toBe(false);
    expect(lines).toContain("soda: token（今回作成）: TOK");
    expect(lines).toContain("soda: (token は今だけ表示します)");
    expect(lines.join("\n")).toContain("--origin");
  });

  it("ゾーン付きの IPv6 でも --origin を渡せば、それを開ける URL として表示する", () => {
    const lines = startupLines({ ...base, host: "fe80::1%eth0", extraOrigins: ["https://box.example:8443"], freshToken: "TOK" });
    expect(lines).toContain("soda: open https://box.example:8443/#token=TOK");
    expect(lines.some((l) => l.includes("fe80") && l.startsWith("soda: open "))).toBe(false);
  });
});

describe("lastChanceTokenLines", () => {
  it("token を表示し、失くしたら token reset で作り直せることを添える", () => {
    const lines = lastChanceTokenLines("TOK");
    expect(lines[0]).toBe("soda: token（今回作成・この表示が最後）: TOK");
    expect(lines.join("\n")).toContain("soda token reset");
  });
});

/** 20260926-named-session-ui（AC16・SODA_SESSION の表示）。 */
describe("startupLines の記録したポート・SODA_SESSION", () => {
  const named = { ...base, host: "127.0.0.1", scheme: "http" as const, port: 7781, freshToken: undefined };

  it("記録したポートで待ち受けたら、session の行の次にその旨と --port を出す", () => {
    const lines = startupLines({ ...named, session: { name: "work", stateDir: "/s/sessions/work" }, portRemembered: true });
    expect(lines.slice(0, 3)).toEqual([
      "soda: listening on 127.0.0.1 port 7781 (http)",
      "soda: session work（状態ディレクトリ: /s/sessions/work）",
      "soda: session work が前回使ったポート 7781 で待ち受けています（別のポートにするには --port。次からはそのポートを使います）",
    ]);
  });

  it("記録を使っていなければ出さない", () => {
    const lines = startupLines({ ...named, session: { name: "work", stateDir: "/s/sessions/work" }, portRemembered: false });
    expect(lines.some((l) => l.includes("前回使ったポート"))).toBe(false);
  });

  it("SODA_SESSION から選んだ名前なら session の行の末尾に（SODA_SESSION）", () => {
    const lines = startupLines({ ...named, session: { name: "work", stateDir: "/s/sessions/work", fromEnv: true } });
    expect(lines[1]).toBe("soda: session work（状態ディレクトリ: /s/sessions/work）（SODA_SESSION）");
  });
});
