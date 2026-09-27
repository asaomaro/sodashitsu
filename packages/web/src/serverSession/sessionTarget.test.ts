import type { ServerSessionEntry } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { sessionTarget } from "./sessionTarget.js";

/** 20260926-named-session-ui（AC6・AC7）。 */
describe("sessionTarget", () => {
  const running = (
    host: string,
    over: Partial<ServerSessionEntry> = {},
    https = false,
  ): ServerSessionEntry => ({
    name: "work",
    default: false,
    running: true,
    current: false,
    endpoint: { port: 7781, https, host },
    ...over,
  });

  it("いま開いている session は current", () => {
    expect(sessionTarget(running("0.0.0.0", { current: true }), "localhost")).toEqual({
      kind: "current",
    });
  });

  it("止まっていれば起動のコマンド（既定の session も --session default。pane の SODA_SESSION に選ばせない）", () => {
    expect(
      sessionTarget({ name: "work", default: false, running: false, current: false }, "localhost"),
    ).toEqual({ kind: "stopped", command: "soda serve --session work" });
    expect(
      sessionTarget(
        { name: "default", default: true, running: false, current: false },
        "localhost",
      ),
    ).toEqual({ kind: "stopped", command: "soda serve --session default" });
  });

  it("動いていて開くための情報が無ければ unknown", () => {
    expect(
      sessionTarget({ name: "work", default: false, running: true, current: false }, "localhost"),
    ).toEqual({ kind: "unknown" });
  });

  it("全インタフェース：いまのホスト名がループバックならその族のループバックのアドレス、そうでなければいまのホスト名", () => {
    expect(sessionTarget(running("0.0.0.0"), "localhost")).toEqual({
      kind: "open",
      url: "http://127.0.0.1:7781/",
    });
    expect(sessionTarget(running("0.0.0.0"), "foo.localhost")).toEqual({
      kind: "open",
      url: "http://127.0.0.1:7781/",
    });
    expect(sessionTarget(running("::"), "[::1]")).toEqual({
      kind: "open",
      url: "http://[::1]:7781/",
    });
    expect(sessionTarget(running("0.0.0.0"), "192.168.1.50")).toEqual({
      kind: "open",
      url: "http://192.168.1.50:7781/",
    });
    expect(sessionTarget(running("::"), "[fd00::5]")).toEqual({
      kind: "open",
      url: "http://[fd00::5]:7781/",
    });
    expect(sessionTarget(running("0.0.0.0"), "MyHost.local")).toEqual({
      kind: "open",
      url: "http://myhost.local:7781/",
    });
  });

  it("全インタフェースの IPv4（0.0.0.0）で、いまが IPv6 のアドレスなら開く先が分からない", () => {
    expect(sessionTarget(running("0.0.0.0"), "[fd00::5]")).toEqual({ kind: "unknown" });
  });

  it("ループバック：いまのホスト名がループバックのときだけ、待ち受けのホストそのもので開く（相手が必ず許す名前・待ち受けた族）", () => {
    for (const here of ["localhost", "127.0.0.1", "[::1]", "foo.localhost"]) {
      expect(sessionTarget(running("127.0.0.1"), here)).toEqual({
        kind: "open",
        url: "http://127.0.0.1:7781/",
      });
      expect(sessionTarget(running("::1"), here)).toEqual({
        kind: "open",
        url: "http://[::1]:7781/",
      });
      expect(sessionTarget(running("[::1]"), here)).toEqual({
        kind: "open",
        url: "http://[::1]:7781/",
      });
      expect(sessionTarget(running("localhost"), here)).toEqual({
        kind: "open",
        url: "http://localhost:7781/",
      });
      expect(sessionTarget(running("LOCALHOST"), here)).toEqual({
        kind: "open",
        url: "http://localhost:7781/",
      });
      expect(sessionTarget(running("app.localhost"), here)).toEqual({
        kind: "open",
        url: "http://app.localhost:7781/",
      });
    }
    for (const bind of ["127.0.0.1", "localhost", "::1", "app.localhost"]) {
      expect(sessionTarget(running(bind), "192.168.1.50")).toEqual({ kind: "unreachable" });
      expect(sessionTarget(running(bind), "my.tailnet.ts.net")).toEqual({ kind: "unreachable" });
    }
  });

  it("特定のアドレスで待ち受けていればそのアドレス（IPv6 は角括弧）", () => {
    expect(sessionTarget(running("192.168.1.60"), "localhost")).toEqual({
      kind: "open",
      url: "http://192.168.1.60:7781/",
    });
    expect(sessionTarget(running("fd00::2"), "localhost")).toEqual({
      kind: "open",
      url: "http://[fd00::2]:7781/",
    });
  });

  it("TLS なら https", () => {
    expect(sessionTarget(running("0.0.0.0", {}, true), "host.example")).toEqual({
      kind: "open",
      url: "https://host.example:7781/",
    });
  });

  it("URL にできないホスト（ゾーン付きの IPv6 等）・空のホスト名は unknown", () => {
    expect(sessionTarget(running("fe80::1%eth0"), "localhost")).toEqual({ kind: "unknown" });
    expect(sessionTarget(running("0.0.0.0"), "")).toEqual({ kind: "unknown" });
  });
});
