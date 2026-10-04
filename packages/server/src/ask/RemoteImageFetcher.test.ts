import { describe, expect, it } from "vitest";
import { RemoteImageFetcher, isBlockedAddress, type RemoteRequestArgs, type RemoteResponse } from "./RemoteImageFetcher.js";

const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n"), Buffer.from([0x1a, 0x0a]), Buffer.alloc(16)]);

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1",
    "192.168.1.1", "198.18.0.1", "198.19.1.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1",
    "::127.0.0.1", "2001:db8::1", "2001::1", "2002:7f00:1::1", "2002:a9fe:a9fe::1", "fe80::1%eth0", "not-an-ip", "1.2.3", "300.1.1.1", "::g", "1::2::3",
  ])("拒否: %s", (a) => expect(isBlockedAddress(a)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "2606:4700:4700::1111", "2a00:1450:4009::200e", "::ffff:8.8.8.8", "2002:0808:0808::1"])(
    "許可: %s",
    (a) => expect(isBlockedAddress(a)).toBe(false),
  );
});

function response(over: Partial<RemoteResponse> & { chunks?: Uint8Array[] } = {}): RemoteResponse {
  const chunks = over.chunks ?? [PNG];
  return {
    status: 200,
    headers: { "content-type": "image/png" },
    body: (async function* () {
      for (const c of chunks) yield c;
    })(),
    destroy: () => undefined,
    ...over,
  };
}

interface Harness {
  fetcher: RemoteImageFetcher;
  requests: RemoteRequestArgs[];
  lookups: string[];
}
function harness(handler: (a: RemoteRequestArgs, n: number) => RemoteResponse | Promise<RemoteResponse>, dns: Record<string, string[]> = {}, opts: { maxBytes?: number; timeoutMs?: number } = {}): Harness {
  const requests: RemoteRequestArgs[] = [];
  const lookups: string[] = [];
  const fetcher = new RemoteImageFetcher({
    lookup: async (h) => {
      lookups.push(h);
      const found = dns[h] ?? ["93.184.216.34"];
      return found.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    },
    request: async (a) => handler(a, requests.push(a)),
    ...opts,
  });
  return { fetcher, requests, lookups };
}
const sig = (): AbortSignal => new AbortController().signal;
const fails = async (h: Harness, url: string, re: RegExp): Promise<void> => {
  await expect(h.fetcher.fetchImage(url, sig())).rejects.toThrow(re);
};

describe("RemoteImageFetcher — 取得できる", () => {
  it("検査したアドレスに固定して取り、ヘッダは必要最小限（Cookie・Authorization・Referer・Origin なし）", async () => {
    const h = harness(() => response());
    const r = await h.fetcher.fetchImage("https://example.com/a.png?x=1", sig());
    expect(r.bytes.equals(PNG)).toBe(true);
    expect(r.contentType).toBe("image/png");
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.address).toBe("93.184.216.34");
    const names = Object.keys(h.requests[0]!.headers).map((k) => k.toLowerCase());
    expect(names.sort()).toEqual(["accept", "accept-encoding", "user-agent"]);
    for (const bad of ["cookie", "authorization", "referer", "origin"]) expect(names).not.toContain(bad);
  });
  it("リダイレクトを辿る（3 回まで）。毎回、公開アドレスかを検査し直す", async () => {
    const h = harness((a, n) => (n <= 3 ? response({ status: 302, headers: { location: `/r${n}` } }) : response()));
    expect((await h.fetcher.fetchImage("https://example.com/a.png", sig())).bytes.length).toBe(PNG.length);
    expect(h.requests.map((r) => r.url.pathname)).toEqual(["/a.png", "/r1", "/r2", "/r3"]);
    expect(h.lookups).toHaveLength(4);
  });
});

describe("RemoteImageFetcher — SSRF（接続を試みずに拒否する）", () => {
  it.each([
    ["http", "http://example.com/a.png", /only https/],
    ["ポート 443 以外", "https://example.com:8443/a.png", /port 443/],
    ["認証情報", "https://user:pass@example.com/a.png", /credentials/],
    ["IPv4 ループバック", "https://127.0.0.1/a.png", /blocked address/],
    ["メタデータ", "https://169.254.169.254/latest/meta-data", /blocked address/],
    ["プライベート", "https://10.0.0.1/a.png", /blocked address/],
    ["IPv6 ループバック", "https://[::1]/a.png", /blocked address/],
    ["10 進整数の IP", "https://2130706433/a.png", /blocked address/],
    ["16 進の IP", "https://0x7f.1/a.png", /blocked address/],
    ["localhost", "https://localhost/a.png", /blocked host/],
    ["サブドメインの localhost", "https://a.localhost/a.png", /blocked host/],
  ])("%s", async (_n, url, re) => {
    const h = harness(() => response());
    await fails(h, url, re);
    expect(h.requests).toHaveLength(0);
  });
  it("プライベートへ解決するホスト名・1 つでもプライベートが混ざる解決は、リクエストを出さない", async () => {
    const h = harness(() => response(), { "evil.example": ["10.0.0.5"], "mixed.example": ["93.184.216.34", "127.0.0.1"] });
    await fails(h, "https://evil.example/a.png", /blocked address/);
    await fails(h, "https://mixed.example/a.png", /blocked address/);
    expect(h.requests).toHaveLength(0);
  });
  it("プライベート・別の scheme・認証情報つきへのリダイレクトは、次のリクエストを出さない", async () => {
    for (const location of ["https://127.0.0.1/x.png", "http://example.com/x.png", "https://u:p@example.com/x.png", "https://evil.example/x.png"]) {
      const h = harness(() => response({ status: 302, headers: { location } }), { "evil.example": ["192.168.0.1"] });
      await expect(h.fetcher.fetchImage("https://example.com/a.png", sig())).rejects.toThrow();
      expect(h.requests).toHaveLength(1); // 最初の 1 回だけ
    }
  });
  it("4 回目のリダイレクトは拒否", async () => {
    const h = harness(() => response({ status: 301, headers: { location: "/again" } }));
    await fails(h, "https://example.com/a.png", /too many redirects/);
    expect(h.requests).toHaveLength(4);
  });
});

describe("RemoteImageFetcher — 応答の検査", () => {
  it("200 以外・Content-Type が画像でない・本文が種類と合わない・大きすぎる は失敗", async () => {
    await fails(harness(() => response({ status: 404 })), "https://example.com/a.png", /status 404/);
    await fails(harness(() => response({ headers: { "content-type": "text/html" } })), "https://example.com/a.png", /content type/);
    await fails(harness(() => response({ chunks: [Buffer.from("<html>nope</html>")] })), "https://example.com/a.png", /does not match/);
    await fails(harness(() => response({ headers: { "content-type": "image/jpeg" } })), "https://example.com/a.png", /does not match/); // PNG の本文に jpeg の名乗り
    await fails(harness(() => response({ chunks: [Buffer.alloc(100, 1), Buffer.alloc(100, 1)] }), {}, { maxBytes: 150 }), "https://example.com/a.png", /too large/);
    await fails(harness(() => response({ headers: { "content-type": "image/png", "content-length": "9999" } }), {}, { maxBytes: 150 }), "https://example.com/a.png", /too large/);
  });
  it("時間の上限（応答が来ない）は失敗", async () => {
    const h = harness((a) => new Promise((_res, rej) => a.signal.addEventListener("abort", () => rej(new Error("aborted")))), {}, { timeoutMs: 30 });
    await expect(h.fetcher.fetchImage("https://example.com/a.png", sig())).rejects.toThrow();
  });
  it("同時 4 件まで", async () => {
    let live = 0;
    let peak = 0;
    const h = harness(async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 15));
      live--;
      return response();
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => h.fetcher.fetchImage(`https://example.com/${i}.png`, sig())));
    expect(peak).toBe(4);
  });
});
