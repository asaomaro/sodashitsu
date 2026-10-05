import { describe, expect, it } from "vitest";
import { accessUrls, isLocalOnlyServer, formatUrlHost, isLoopbackHost, isWildcardHost, lanIpv4Addresses, paneServerUrl, requestPathname, unbracketHost } from "./net.js";

describe("isLoopbackHost", () => {
  it("recognizes loopback forms", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("foo.localhost")).toBe(true);
  });
  it("rejects non-loopback forms", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.1")).toBe(false);
    expect(isLoopbackHost("example.com")).toBe(false);
  });
});

describe("isWildcardHost", () => {
  it("recognizes wildcard binds", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isWildcardHost("::")).toBe(true);
  });
  it("rejects non-wildcard hosts", () => {
    expect(isWildcardHost("127.0.0.1")).toBe(false);
  });
});

describe("lanIpv4Addresses", () => {
  it("別のマシンから宛先にできる IPv4 だけを、重複を除いて見つけた順に返す", () => {
    const ifaces = [
      { name: "lo", address: "127.0.0.1", family: "IPv4", internal: true },
      { name: "lo", address: "10.255.255.254", family: "IPv4", internal: true }, // WSL2 の lo に載るアドレス
      { name: "lo", address: "::1", family: "IPv6", internal: true },
      { name: "eth0", address: "192.168.1.50", family: "IPv4", internal: false },
      { name: "eth0", address: "fe80::1", family: "IPv6", internal: false },
      { name: "eth1", address: "169.254.3.4", family: "IPv4", internal: false },
      { name: "wlan0", address: "10.0.0.7", family: "IPv4", internal: false },
      { name: "eth0:1", address: "192.168.1.50", family: "IPv4", internal: false },
    ];
    expect(lanIpv4Addresses(ifaces)).toEqual(["192.168.1.50", "10.0.0.7"]);
  });

  it("コンテナ・VM の仮想ブリッジ（Linux）に載ったアドレスは表示しない（先頭が docker0 等にならない。D102）", () => {
    const v4 = (name: string, address: string) => ({ name, address, family: "IPv4", internal: false });
    const ifaces = [
      v4("docker0", "172.17.0.1"),
      v4("br-7b7a5ce4254b", "172.18.0.1"), // docker のユーザー定義ネットワーク
      v4("virbr0", "192.168.122.1"), // libvirt
      v4("veth1a2b3c", "172.17.0.5"),
      v4("cni0", "10.88.0.1"),
      v4("podman1", "10.89.0.1"),
      v4("lxdbr0", "10.10.10.1"),
      v4("vboxnet0", "192.168.56.1"),
      v4("vmnet8", "192.168.200.1"),
      v4("eth0", "192.168.1.50"),
      v4("br0", "192.168.1.60"), // 物理 NIC を束ねたホストのブリッジ（実際の LAN の IP が載る）は残す
      v4("tailscale0", "100.64.0.3"), // tailnet からは届くので残す
    ];
    expect(lanIpv4Addresses(ifaces)).toEqual(["192.168.1.50", "192.168.1.60", "100.64.0.3"]);
  });

  it("br- は docker のユーザー定義ネットワーク（br-<12 桁の 16 進>）だけを除き、利用者が付けた br-lan・br-ex 等は残す（D102）", () => {
    const v4 = (name: string, address: string) => ({ name, address, family: "IPv4", internal: false });
    const ifaces = [
      v4("br-7b7a5ce4254b", "172.18.0.1"), // docker
      v4("br-lan", "192.168.1.1"), // OpenWrt 等の LAN のブリッジ
      v4("br-ex", "10.0.0.10"), // OpenStack の外部ブリッジ
      v4("br-7b7a5ce4254", "172.19.0.1"), // 11 桁：docker の形ではない
      v4("br-7B7A5CE4254B", "172.20.0.1"), // 大文字：docker は小文字で付ける
    ];
    expect(lanIpv4Addresses(ifaces)).toEqual(["192.168.1.1", "10.0.0.10", "172.19.0.1", "172.20.0.1"]);
  });

  it("Windows の Hyper-V の内部スイッチ（WSL・Default Switch 等）は除き、外部スイッチ（母艦の LAN の IP が載る）は残す（D102）", () => {
    const v4 = (name: string, address: string) => ({ name, address, family: "IPv4", internal: false });
    const ifaces = [
      v4("vEthernet (WSL)", "172.26.96.1"),
      v4("vEthernet (WSL (Hyper-V firewall))", "172.27.96.1"),
      v4("vEthernet (Default Switch)", "172.20.160.1"),
      v4("vEthernet (nat)", "172.21.0.1"),
      v4("vEthernet (DockerNAT)", "10.0.75.1"),
      v4("VirtualBox Host-Only Network", "192.168.56.1"),
      v4("VMware Network Adapter VMnet8", "192.168.200.1"),
      v4("VirtualBox Host-Only Network #2", "192.168.57.1"),
      v4("VMware Network Adapter VMnet1", "192.168.100.1"),
      v4("vEthernet (External Switch)", "192.168.1.20"), // 外部スイッチ：物理 NIC の代わりにここへ LAN の IP が載る
      v4("vEthernet (LAN)", "192.168.1.21"), // 外部スイッチの名前は利用者が付ける（External を含むとは限らない）
      v4("Wi-Fi", "192.168.1.22"),
      v4("イーサネット", "192.168.1.23"),
    ];
    expect(lanIpv4Addresses(ifaces)).toEqual(["192.168.1.20", "192.168.1.21", "192.168.1.22", "192.168.1.23"]);
  });

  it("既知の内部スイッチの名前で始まっても、利用者が付けた外部スイッチ（WSLBridge・WSL-External 等）は残す（前方一致にしない。D102）", () => {
    const v4 = (name: string, address: string) => ({ name, address, family: "IPv4", internal: false });
    const ifaces = [
      v4("vEthernet (WSLBridge)", "192.168.1.30"),
      v4("vEthernet (WSL-External)", "192.168.1.31"),
      v4("vEthernet (Default Switch 2)", "192.168.1.32"),
      v4("vEthernet (natural)", "192.168.1.33"),
      v4("vEthernet (DockerNATBridge)", "192.168.1.34"),
      v4("VirtualBox Host-Only Network Bridge", "192.168.1.35"),
      v4("VMware Network Adapter VMnet1 (bridged)", "192.168.1.36"),
      v4("vEthernet (WSL)", "172.26.96.1"), // 既知の名前と完全に一致するものだけ除く
    ];
    expect(lanIpv4Addresses(ifaces)).toEqual([
      "192.168.1.30",
      "192.168.1.31",
      "192.168.1.32",
      "192.168.1.33",
      "192.168.1.34",
      "192.168.1.35",
      "192.168.1.36",
    ]);
  });
});

describe("accessUrls", () => {
  it("0.0.0.0 / :: で待ち受けるときは開けない 0.0.0.0 ではなく localhost と LAN の IPv4 を並べる", () => {
    const lan = ["192.168.1.50", "10.0.0.7"];
    const expected = ["https://localhost:8443", "https://192.168.1.50:8443", "https://10.0.0.7:8443"];
    expect(accessUrls("https", "0.0.0.0", 8443, lan, [])).toEqual(expected);
    expect(accessUrls("https", "::", 8443, lan, [])).toEqual(expected);
    expect(accessUrls("https", "0.0.0.0", 8443, [], [])).toEqual(["https://localhost:8443"]);
  });
  it("明示したホストはそのまま（IPv6 は角括弧で囲む）", () => {
    expect(accessUrls("http", "127.0.0.1", 7681, ["192.168.1.50"], [])).toEqual(["http://127.0.0.1:7681"]);
    expect(accessUrls("http", "::1", 7681, [], [])).toEqual(["http://[::1]:7681"]);
    expect(accessUrls("http", "[::1]", 7681, [], [])).toEqual(["http://[::1]:7681"]);
    expect(accessUrls("https", "myhost.example", 443, [], [])).toEqual(["https://myhost.example:443"]);
  });

  it("--origin で渡した Origin を先頭に並べ、同じ Origin は 1 つにする（ポート転送・Tailscale の名前で開く構成。D102）", () => {
    const lan = ["192.168.1.50"];
    // WSL2 の NAT＋portproxy：ブラウザが開くのは母艦の LAN の IP で、WSL のインタフェースには無い
    expect(accessUrls("https", "0.0.0.0", 8443, ["172.26.111.149"], ["https://192.168.0.10:8443"])).toEqual([
      "https://192.168.0.10:8443",
      "https://localhost:8443",
      "https://172.26.111.149:8443",
    ]);
    // 自前で並べるものと同じ Origin は重ねない（先に出た --origin の形を残す）
    expect(accessUrls("https", "0.0.0.0", 8443, lan, ["https://box.tailnet.ts.net:8443", "https://192.168.1.50:8443"])).toEqual([
      "https://box.tailnet.ts.net:8443",
      "https://192.168.1.50:8443",
      "https://localhost:8443",
    ]);
    // 既定ポートの省略・大文字小文字の違いも同じ Origin として扱う
    expect(accessUrls("https", "MyHost.example", 443, [], ["https://myhost.example"])).toEqual(["https://myhost.example"]);
    // 同じ --origin を 2 回渡しても 1 回だけ
    expect(accessUrls("http", "127.0.0.1", 7780, [], ["https://a.example", "https://a.example"])).toEqual([
      "https://a.example",
      "http://127.0.0.1:7780",
    ]);
  });
});

describe("accessUrls — URL にできないホスト（D103）", () => {
  it("ゾーン付きの IPv6（fe80::1%eth0）は投げずに並べない（WHATWG URL は %25 の形も受け付けず、ブラウザでも開けない）", () => {
    expect(() => new URL("https://[fe80::1%25eth0]:8443")).toThrow(); // 前提：RFC 6874 の形も URL にできない
    expect(accessUrls("https", "fe80::1%eth0", 8443, [], [])).toEqual([]);
    expect(accessUrls("https", "[fe80::1%eth0]", 8443, [], [])).toEqual([]);
    // --origin を渡せば、それだけを並べる
    expect(accessUrls("https", "fe80::1%eth0", 8443, [], ["https://box.example:8443"])).toEqual(["https://box.example:8443"]);
  });
});

describe("requestPathname（HTTP の request-target の解釈。D103）", () => {
  it("origin-form は経路（クエリを除く）を返す", () => {
    expect(requestPathname("/")).toBe("/");
    expect(requestPathname("/api/login?x=1")).toBe("/api/login");
    expect(requestPathname("/ws")).toBe("/ws");
    expect(requestPathname("/assets/app.js")).toBe("/assets/app.js");
    expect(requestPathname(undefined)).toBe("/");
  });
  it("//・///・/\\・//foo は例外にもスキーム相対にもせず、ただの経路として返す（以前は例外 → error 行。ブラウザは https://host//foo で //foo を送る。独立点検 #5）", () => {
    expect(requestPathname("//")).toBe("//");
    expect(requestPathname("///")).toBe("///");
    expect(requestPathname("/\\")).toBe("//");
    expect(requestPathname("//foo")).toBe("//foo");
    // 別のホストとして読まない（/api/login・/ws にならない）
    expect(requestPathname("//evil.example/api/login")).toBe("//evil.example/api/login");
    expect(requestPathname("//ws")).toBe("//ws");
    expect(requestPathname("/\\evil.example/ws")).toBe("//evil.example/ws");
  });
  it("absolute-form（http(s)://host/…）は、その URL の経路", () => {
    expect(requestPathname("http://127.0.0.1:7780/ws")).toBe("/ws");
    expect(requestPathname("HTTPS://box.example/api/session")).toBe("/api/session");
  });
  it("origin-form・absolute-form でないもの（*・authority-form・相対）と、解釈できない absolute-form は undefined", () => {
    expect(requestPathname("*")).toBeUndefined();
    expect(requestPathname("127.0.0.1:443")).toBeUndefined();
    expect(requestPathname("api/login")).toBeUndefined();
    expect(requestPathname("\\\\x")).toBeUndefined();
    expect(requestPathname("http://[fe80::1%eth0]/ws")).toBeUndefined();
  });
});

describe("unbracketHost / formatUrlHost（D102：角括弧の処理を 1 か所に）", () => {
  it("角括弧付きの IPv6 だけ角括弧を外す", () => {
    expect(unbracketHost("[::1]")).toBe("::1");
    expect(unbracketHost("[::]")).toBe("::");
    expect(unbracketHost("::1")).toBe("::1");
    expect(unbracketHost("localhost")).toBe("localhost");
  });
  it("IPv6 は角括弧で囲み、既に囲まれていれば二重に囲まない", () => {
    expect(formatUrlHost("::1")).toBe("[::1]");
    expect(formatUrlHost("[::1]")).toBe("[::1]");
    expect(formatUrlHost("0.0.0.0")).toBe("0.0.0.0");
  });
});

describe("paneServerUrl（pane の環境の SODA_SERVER_URL。20260926-agent-skill-file）", () => {
  it.each([
    ["http", "127.0.0.1", 7780, "http://127.0.0.1:7780"],
    ["http", "0.0.0.0", 7781, "http://127.0.0.1:7781"],
    ["https", "::", 8443, "https://[::1]:8443"],
    ["http", "::1", 7780, "http://[::1]:7780"],
    ["http", "[::1]", 7780, "http://[::1]:7780"],
    ["http", "localhost", 7780, "http://localhost:7780"],
    ["https", "192.168.1.50", 8443, "https://192.168.1.50:8443"],
    ["https", "myhost.lan", 443, "https://myhost.lan:443"],
  ] as const)("%s %s:%d -> %s", (scheme, host, port, expected) => {
    expect(paneServerUrl(scheme, host, port)).toBe(expected);
  });
  it("URL にできないホスト（ゾーン付きの IPv6）は undefined", () => {
    expect(paneServerUrl("https", "fe80::1%eth0", 8443)).toBeUndefined();
  });
});

describe("isLocalOnlyServer（ask のメディアの上限を外してよいローカル起動）", () => {
  it("loopback だけで、TLS も --origin も無いときだけ真", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "[::1]"]) expect(isLocalOnlyServer(h, false, [])).toBe(true);
  });
  it("外向き（全インタフェース・LAN の IP）・TLS・--origin（プロキシ・ポート転送）は偽", () => {
    for (const h of ["0.0.0.0", "::", "192.168.1.5", "example.com"]) expect(isLocalOnlyServer(h, false, [])).toBe(false);
    expect(isLocalOnlyServer("127.0.0.1", true, [])).toBe(false);
    expect(isLocalOnlyServer("127.0.0.1", false, ["https://soda.example.test"])).toBe(false);
  });
});
