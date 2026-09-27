import { describe, expect, it } from "vitest";
import type { NetworkInfo } from "../infra/OsNetworkInfo.js";
import { accessUrls } from "../util/net.js";
import { DefaultOriginPolicy } from "./OriginPolicy.js";

const fakeNet: NetworkInfo = {
  addresses: () => ["127.0.0.1", "10.0.0.5", "192.168.1.9"],
  lanAddresses: () => ["10.0.0.5", "192.168.1.9"],
  hostnames: () => ["dev-box"],
};

describe("DefaultOriginPolicy — loopback bind", () => {
  const policy = new DefaultOriginPolicy({ host: "127.0.0.1", port: 7780, secure: false, extraOrigins: [] }, fakeNet);

  it("allows the loopback origin", () => {
    expect(policy.isAllowed("http://127.0.0.1:7780", "127.0.0.1:7780")).toBe(true);
    expect(policy.isAllowed("http://localhost:7780", "localhost:7780")).toBe(true);
  });

  it("rejects a mismatched scheme (same-origin check)", () => {
    expect(policy.isAllowed("https://127.0.0.1:7780", "127.0.0.1:7780")).toBe(false);
  });

  it("rejects an arbitrary external Host header (DNS rebinding)", () => {
    expect(policy.isAllowed("http://evil.example:7780", "evil.example:7780")).toBe(false);
  });

  it("rejects a missing Origin or Host header", () => {
    expect(policy.isAllowed(undefined, "127.0.0.1:7780")).toBe(false);
    expect(policy.isAllowed("http://127.0.0.1:7780", undefined)).toBe(false);
  });

  it("does not allow the host's own LAN addresses when bound to loopback only", () => {
    expect(policy.isAllowed("http://10.0.0.5:7780", "10.0.0.5:7780")).toBe(false);
  });
});

describe("DefaultOriginPolicy — wildcard bind", () => {
  const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 7780, secure: true, extraOrigins: [] }, fakeNet);

  it("allows every local interface address and hostname", () => {
    expect(policy.isAllowed("https://10.0.0.5:7780", "10.0.0.5:7780")).toBe(true);
    expect(policy.isAllowed("https://192.168.1.9:7780", "192.168.1.9:7780")).toBe(true);
    expect(policy.isAllowed("https://dev-box:7780", "dev-box:7780")).toBe(true);
    expect(policy.isAllowed("https://127.0.0.1:7780", "127.0.0.1:7780")).toBe(true);
  });

  it("still rejects a Host header that is not one of the known addresses", () => {
    expect(policy.isAllowed("https://8.8.8.8:7780", "8.8.8.8:7780")).toBe(false);
  });
});

describe("DefaultOriginPolicy — explicit non-wildcard bind", () => {
  it("allows exactly the bound address in addition to loopback", () => {
    const policy = new DefaultOriginPolicy({ host: "10.0.0.5", port: 7780, secure: false, extraOrigins: [] }, fakeNet);
    expect(policy.isAllowed("http://10.0.0.5:7780", "10.0.0.5:7780")).toBe(true);
    expect(policy.isAllowed("http://127.0.0.1:7780", "127.0.0.1:7780")).toBe(true);
    expect(policy.isAllowed("http://192.168.1.9:7780", "192.168.1.9:7780")).toBe(false);
  });
});

describe("DefaultOriginPolicy — --origin extras", () => {
  it("allows an extra origin outright, without requiring it to match the Host header", () => {
    const policy = new DefaultOriginPolicy(
      { host: "127.0.0.1", port: 7780, secure: false, extraOrigins: ["https://box.ts.net"] },
      fakeNet,
    );
    expect(policy.isAllowed("https://box.ts.net", "anything")).toBe(true);
  });
});

describe("DefaultOriginPolicy — scheme の既定ポート（レビュー指摘の回帰テスト）", () => {
  it("also allows the port-less Host/Origin form when listening on the TLS default port 443", () => {
    // ブラウザは既定ポート（https:443）では Host/Origin ヘッダからポートを省略する。
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 443, secure: true, extraOrigins: [] }, fakeNet);
    expect(policy.isAllowed("https://dev-box", "dev-box")).toBe(true);
    expect(policy.isAllowed("https://dev-box:443", "dev-box:443")).toBe(true); // ポート付きも引き続き許可
  });

  it("also allows the port-less Host/Origin form when listening on the plain-HTTP default port 80", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 80, secure: false, extraOrigins: [] }, fakeNet);
    expect(policy.isAllowed("http://10.0.0.5", "10.0.0.5")).toBe(true);
  });

  it("does not add the port-less form for a non-default port", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 7780, secure: true, extraOrigins: [] }, fakeNet);
    expect(policy.isAllowed("https://dev-box", "dev-box")).toBe(false);
  });
});

describe("DefaultOriginPolicy — IPv6", () => {
  it("brackets IPv6 addresses in the allowed host:port form", () => {
    const policy = new DefaultOriginPolicy({ host: "::1", port: 7780, secure: false, extraOrigins: [] }, fakeNet);
    expect(policy.allowedHostPorts()).toContain("[::1]:7780");
    expect(policy.isAllowed("http://[::1]:7780", "[::1]:7780")).toBe(true);
  });
});

describe("DefaultOriginPolicy — ホスト名の大文字小文字・起動時に表示する URL（D101）", () => {
  it("ホスト名の大文字小文字を区別しない（ブラウザは小文字で送る。Windows のホスト名は大文字が多い）", () => {
    const upperNet: NetworkInfo = { ...fakeNet, hostnames: () => ["DESKTOP-AB12"] };
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 7780, secure: true, extraOrigins: [] }, upperNet);
    expect(policy.isAllowed("https://desktop-ab12:7780", "desktop-ab12:7780")).toBe(true);
    const explicit = new DefaultOriginPolicy({ host: "MyHost.example", port: 7780, secure: true, extraOrigins: ["https://My.Tailnet.ts.net"] }, fakeNet);
    expect(explicit.isAllowed("https://myhost.example:7780", "myhost.example:7780")).toBe(true);
    expect(explicit.isAllowed("https://my.tailnet.ts.net", "my.tailnet.ts.net")).toBe(true);
  });

  it("明示したループバックの名前（`foo.localhost`）も許す", () => {
    const policy = new DefaultOriginPolicy({ host: "foo.localhost", port: 7780, secure: false, extraOrigins: [] }, fakeNet);
    expect(policy.isAllowed("http://foo.localhost:7780", "foo.localhost:7780")).toBe(true);
  });

  it("起動時に表示する URL はどれも許可される", () => {
    const cases: { host: string; secure: boolean; port?: number; extraOrigins?: string[] }[] = [
      { host: "0.0.0.0", secure: true, port: 443 }, // 既定ポート：ブラウザはポートを省いた Host/Origin を送る
      { host: "127.0.0.1", secure: false, port: 80 },
      { host: "0.0.0.0", secure: true },
      { host: "::", secure: true },
      { host: "127.0.0.1", secure: false },
      { host: "::1", secure: false },
      { host: "foo.localhost", secure: false },
      { host: "MyHost.example", secure: true },
      // --origin（D102）：Tailscale の名前・ポート転送先の母艦の IP は、このマシンのインタフェースに無くても表示し、許可する
      { host: "0.0.0.0", secure: true, extraOrigins: ["https://box.tailnet.ts.net:7780", "https://192.168.0.10:8443"] },
      { host: "127.0.0.1", secure: false, extraOrigins: ["https://soda.example.com"] }, // リバースプロキシ（TLS はプロキシ側）
    ];
    for (const c of cases) {
      const port = c.port ?? 7780;
      const extraOrigins = c.extraOrigins ?? [];
      const policy = new DefaultOriginPolicy({ host: c.host, port, secure: c.secure, extraOrigins }, fakeNet);
      for (const url of accessUrls(c.secure ? "https" : "http", c.host, port, fakeNet.lanAddresses(), extraOrigins)) {
        const u = new URL(url); // ブラウザと同じく小文字にそろえた Origin/Host を作る
        expect(policy.isAllowed(u.origin, u.host), `${c.host} → ${url}`).toBe(true);
      }
    }
  });
});

/**
 * WSL2 の既定（NAT）モード＋Windows の portproxy を模す（D102）。WSL のインタフェースは `lo`（127.0.0.1・10.255.255.254）と
 * `eth0`（172.26.x）だけで、別のマシンのブラウザが開く母艦の LAN の IP（192.168.0.10）と portproxy の listenport は
 * ここに現れない。許可リストはこのマシンのインタフェースからしか作れないので、そのままでは拒否し、`--origin` で渡せば許す。
 */
describe("DefaultOriginPolicy — ポート転送で届く Host（WSL2 NAT＋portproxy。D102）", () => {
  const wslNatNet: NetworkInfo = {
    addresses: () => ["127.0.0.1", "10.255.255.254", "::1", "172.26.111.149", "fe80::6109:4177:1b30:1e0c"],
    lanAddresses: () => ["172.26.111.149"],
    hostnames: () => ["wsl-box"],
  };
  const forwardedOrigin = "https://192.168.0.10:8443";

  it("このマシンのインタフェースに無い IP で届いた Host は拒否する（--origin なし）", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 8443, secure: true, extraOrigins: [] }, wslNatNet);
    expect(policy.isAllowed(forwardedOrigin, "192.168.0.10:8443")).toBe(false);
    expect(policy.allowedHostPorts()).not.toContain("192.168.0.10:8443");
    // WSL 側で見えるアドレスは許す（母艦の Windows からは 172.x で開ける）。
    expect(policy.isAllowed("https://172.26.111.149:8443", "172.26.111.149:8443")).toBe(true);
  });

  it("転送元のポートが待ち受けのポートと違う（listenport ≠ connectport）Host も拒否する", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 7780, secure: true, extraOrigins: [] }, wslNatNet);
    expect(policy.isAllowed("https://192.168.0.10:8443", "192.168.0.10:8443")).toBe(false);
    // WSL 自身の IP でも、ポートが違えば許可リストに無い。
    expect(policy.isAllowed("https://172.26.111.149:8443", "172.26.111.149:8443")).toBe(false);
  });

  it("ブラウザが開く Origin を --origin で渡せば許す（ポートが違っても）", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 8443, secure: true, extraOrigins: [forwardedOrigin] }, wslNatNet);
    expect(policy.isAllowed(forwardedOrigin, "192.168.0.10:8443")).toBe(true);
    const otherPort = new DefaultOriginPolicy({ host: "0.0.0.0", port: 7780, secure: true, extraOrigins: [forwardedOrigin] }, wslNatNet);
    expect(otherPort.isAllowed(forwardedOrigin, "192.168.0.10:8443")).toBe(true);
    // 渡していない別の Origin は引き続き拒否する（DNS rebinding 対策は保つ）。
    expect(policy.isAllowed("https://192.168.0.11:8443", "192.168.0.11:8443")).toBe(false);
  });
});

/** D106：Origin を付けない同じオリジンの GET（`/api/session`）は Host だけで見る。 */
describe("DefaultOriginPolicy.isHostAllowed（D106）", () => {
  it("許可ホスト（ループバック・待ち受けアドレス）の Host を許し、それ以外・無しは拒否する", () => {
    const policy = new DefaultOriginPolicy({ host: "127.0.0.1", port: 7780, secure: false, extraOrigins: [] }, fakeNet);
    expect(policy.isHostAllowed("127.0.0.1:7780")).toBe(true);
    expect(policy.isHostAllowed("LOCALHOST:7780")).toBe(true); // 大文字小文字を区別しない
    expect(policy.isHostAllowed("[::1]:7780")).toBe(true);
    expect(policy.isHostAllowed("evil.example:7780")).toBe(false); // DNS rebinding
    expect(policy.isHostAllowed("10.0.0.5:7780")).toBe(false); // ループバックで待ち受けているので LAN の IP は許さない
    expect(policy.isHostAllowed("127.0.0.1:7781")).toBe(false);
    expect(policy.isHostAllowed(undefined)).toBe(false);
  });

  it("0.0.0.0 で待ち受けていれば、全インタフェースの IP とホスト名を許す（既定ポートならポート無しも）", () => {
    const policy = new DefaultOriginPolicy({ host: "0.0.0.0", port: 443, secure: true, extraOrigins: [] }, fakeNet);
    expect(policy.isHostAllowed("10.0.0.5:443")).toBe(true);
    expect(policy.isHostAllowed("dev-box")).toBe(true);
    expect(policy.isHostAllowed("8.8.8.8")).toBe(false);
  });

  it("--origin の Origin のホストを許す：ポート付きは host:port、既定ポートはポート無しの形（ポート違いは拒否）", () => {
    const policy = new DefaultOriginPolicy(
      { host: "127.0.0.1", port: 7780, secure: false, extraOrigins: ["https://x.ts.net:7780", "https://y.ts.net", "https://192.168.0.10:8443"] },
      fakeNet,
    );
    expect(policy.isHostAllowed("x.ts.net:7780")).toBe(true);
    expect(policy.isHostAllowed("X.TS.NET:7780")).toBe(true);
    expect(policy.isHostAllowed("y.ts.net")).toBe(true);
    expect(policy.isHostAllowed("192.168.0.10:8443")).toBe(true); // WSL2 の portproxy（D102）
    expect(policy.isHostAllowed("x.ts.net")).toBe(false); // ポートが違えば別の宛先
    expect(policy.isHostAllowed("y.ts.net:7780")).toBe(false);
    expect(policy.isHostAllowed("z.ts.net")).toBe(false);
  });

  it("既定ポートの --origin は、ポートを付けた Host（https は :443、http は :80）も許す（nginx の `Host $host:$server_port`）", () => {
    const policy = new DefaultOriginPolicy(
      { host: "127.0.0.1", port: 7780, secure: false, extraOrigins: ["https://y.ts.net", "http://plain.example", "https://x.ts.net:7780"] },
      fakeNet,
    );
    expect(policy.isHostAllowed("y.ts.net:443")).toBe(true);
    expect(policy.isHostAllowed("Y.TS.NET:443")).toBe(true);
    expect(policy.isHostAllowed("plain.example:80")).toBe(true);
    expect(policy.isHostAllowed("plain.example")).toBe(true);
    expect(policy.isHostAllowed("y.ts.net:80")).toBe(false); // https の既定ポートは 443
    expect(policy.isHostAllowed("plain.example:443")).toBe(false); // http の既定ポートは 80
    expect(policy.isHostAllowed("x.ts.net:443")).toBe(false); // 既定でないポートの Origin はそのポートだけ
  });

  it("起動時に表示する URL の Host はどれも許す（isAllowed と同じ範囲）", () => {
    const extraOrigins = ["https://box.tailnet.ts.net:7780", "https://192.168.0.10:8443", "https://soda.example.com"];
    for (const host of ["0.0.0.0", "127.0.0.1", "::1"]) {
      const policy = new DefaultOriginPolicy({ host, port: 7780, secure: true, extraOrigins }, fakeNet);
      for (const url of accessUrls("https", host, 7780, fakeNet.lanAddresses(), extraOrigins)) {
        expect(policy.isHostAllowed(new URL(url).host), `${host} → ${url}`).toBe(true);
      }
    }
  });
});
