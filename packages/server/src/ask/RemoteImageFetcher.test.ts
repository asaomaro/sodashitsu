import { describe, expect, it } from "vitest";
import {
  RemoteImageFetcher,
  isBlockedAddress,
  type RemoteRequestArgs,
  type RemoteResponse,
} from "./RemoteImageFetcher.js";

const PNG = Buffer.concat([
  Buffer.from([0x89]),
  Buffer.from("PNG\r\n"),
  Buffer.from([0x1a, 0x0a]),
  Buffer.alloc(16),
]);

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.1.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.1.1.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "::127.0.0.1",
    "2001:db8::1",
    "2001::1",
    "2002:7f00:1::1",
    "2002:a9fe:a9fe::1",
    "fe80::1%eth0",
    "not-an-ip",
    "1.2.3",
    "300.1.1.1",
    "::g",
    "1::2::3",
  ])("拒否: %s", (a) => expect(isBlockedAddress(a)).toBe(true));
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.0.1",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "198.17.0.1",
    "198.20.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4009::200e",
    "::ffff:8.8.8.8",
    "2002:0808:0808::1",
  ])("許可: %s", (a) => expect(isBlockedAddress(a)).toBe(false));
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
function harness(
  handler: (a: RemoteRequestArgs, n: number) => RemoteResponse | Promise<RemoteResponse>,
  dns: Record<string, string[]> = {},
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Harness {
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
    for (const bad of ["cookie", "authorization", "referer", "origin"])
      expect(names).not.toContain(bad);
  });
  it("リダイレクトを辿る（3 回まで）。毎回、公開アドレスかを検査し直す", async () => {
    const h = harness((a, n) =>
      n <= 3 ? response({ status: 302, headers: { location: `/r${n}` } }) : response(),
    );
    expect((await h.fetcher.fetchImage("https://example.com/a.png", sig())).bytes.length).toBe(
      PNG.length,
    );
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
    const h = harness(() => response(), {
      "evil.example": ["10.0.0.5"],
      "mixed.example": ["93.184.216.34", "127.0.0.1"],
    });
    await fails(h, "https://evil.example/a.png", /blocked address/);
    await fails(h, "https://mixed.example/a.png", /blocked address/);
    expect(h.requests).toHaveLength(0);
  });
  it("プライベート・別の scheme・認証情報つきへのリダイレクトは、次のリクエストを出さない", async () => {
    for (const location of [
      "https://127.0.0.1/x.png",
      "http://example.com/x.png",
      "https://u:p@example.com/x.png",
      "https://evil.example/x.png",
    ]) {
      const h = harness(() => response({ status: 302, headers: { location } }), {
        "evil.example": ["192.168.0.1"],
      });
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
    await fails(
      harness(() => response({ status: 404 })),
      "https://example.com/a.png",
      /status 404/,
    );
    await fails(
      harness(() => response({ headers: { "content-type": "text/html" } })),
      "https://example.com/a.png",
      /content type/,
    );
    await fails(
      harness(() => response({ chunks: [Buffer.from("<html>nope</html>")] })),
      "https://example.com/a.png",
      /does not match/,
    );
    await fails(
      harness(() => response({ headers: { "content-type": "image/jpeg" } })),
      "https://example.com/a.png",
      /does not match/,
    ); // PNG の本文に jpeg の名乗り
    await fails(
      harness(
        () => response({ chunks: [Buffer.alloc(100, 1), Buffer.alloc(100, 1)] }),
        {},
        { maxBytes: 150 },
      ),
      "https://example.com/a.png",
      /too large/,
    );
    await fails(
      harness(
        () => response({ headers: { "content-type": "image/png", "content-length": "9999" } }),
        {},
        { maxBytes: 150 },
      ),
      "https://example.com/a.png",
      /too large/,
    );
  });
  it("時間の上限（応答が来ない）は失敗", async () => {
    const h = harness(
      (a) =>
        new Promise((_res, rej) =>
          a.signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
      {},
      { timeoutMs: 30 },
    );
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
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        h.fetcher.fetchImage(`https://example.com/${i}.png`, sig()),
      ),
    );
    expect(peak).toBe(4);
  });
});

describe("RemoteImageFetcher — 検査を通ったアドレスを順に試す・名前解決にも時間の上限", () => {
  it("最初のアドレスに繋げなければ、検査済みの次のアドレスへ回る（IPv6 の経路が無い環境）", async () => {
    const tried: string[] = [];
    const h = harness(
      (a) => {
        tried.push(a.address);
        if (a.family === 6) throw new Error("ENETUNREACH");
        return response();
      },
      { "dual.example": ["2606:4700:4700::1111", "93.184.216.34"] },
    );
    await h.fetcher.fetchImage("https://dual.example/a.png", sig());
    expect(tried).toEqual(["2606:4700:4700::1111", "93.184.216.34"]);
  });
  it("名前解決が返らなくても、時間の上限で失敗する（枠を塞がない）", async () => {
    const fetcher = new RemoteImageFetcher({
      lookup: () => new Promise(() => undefined),
      timeoutMs: 30,
      request: async () => response(),
    });
    await expect(fetcher.fetchImage("https://hang.example/a.png", sig())).rejects.toThrow();
  });
  it("受け取るたびに onBytes へ知らせ、呼び出し側が投げたらそこで読むのをやめる（destroy）", async () => {
    let destroyed = 0;
    const seen: number[] = [];
    const h = harness(() =>
      response({
        chunks: [Buffer.alloc(100, 1), Buffer.alloc(100, 1), Buffer.alloc(100, 1)],
        destroy: () => void destroyed++,
      }),
    );
    await expect(
      h.fetcher.fetchImage("https://example.com/a.png", sig(), (n) => {
        seen.push(n);
        if (seen.length === 2) throw new Error("over budget");
      }),
    ).rejects.toThrow(/over budget/);
    expect(seen).toEqual([100, 100]); // 3 つ目は読んでいない
    expect(destroyed).toBe(1);
  });
  it("上限を超えた応答・リダイレクトの応答は、読むのをやめる（destroy）", async () => {
    let destroyed = 0;
    const big = harness(
      () =>
        response({
          chunks: [Buffer.alloc(100, 1), Buffer.alloc(100, 1)],
          destroy: () => void destroyed++,
        }),
      {},
      { maxBytes: 150 },
    );
    await fails(big, "https://example.com/a.png", /too large/);
    expect(destroyed).toBe(1);
    let redirectDestroyed = 0;
    const redir = harness((_a, n) =>
      n === 1
        ? response({
            status: 302,
            headers: { location: "/b" },
            destroy: () => void redirectDestroyed++,
          })
        : response(),
    );
    await redir.fetcher.fetchImage("https://example.com/a.png", sig());
    expect(redirectDestroyed).toBe(1);
  });
});

describe("makeRealRequest — 実物の https で、接続先が検査したアドレスに固定される", () => {
  it("名前解決できないホスト名でも address へ繋がり、ホスト名で証明書を検証し、Cookie 等は付かない", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { createServer } = await import("node:https");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "soda-tls-"));
    try {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          join(dir, "k.pem"),
          "-out",
          join(dir, "c.pem"),
          "-days",
          "1",
          "-subj",
          "/CN=fake.test",
          "-addext",
          "subjectAltName=DNS:fake.test",
        ],
        { stdio: "ignore" },
      );
      const cert = readFileSync(join(dir, "c.pem"), "utf8");
      let seen: Record<string, string | string[] | undefined> = {};
      const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert }, (req, res) => {
        seen = req.headers;
        res.setHeader("content-type", "image/png");
        res.end(PNG);
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const port = (server.address() as { port: number }).port;
      try {
        const { makeRealRequest } = await import("./RemoteImageFetcher.js");
        const res = await makeRealRequest({ ca: cert })({
          url: new URL(`https://fake.test:${port}/a.png`),
          address: "127.0.0.1",
          family: 4,
          headers: { Accept: "image/png" },
          signal: sig(),
        });
        const chunks: Buffer[] = [];
        for await (const c of res.body) chunks.push(Buffer.from(c));
        expect(res.status).toBe(200);
        expect(Buffer.concat(chunks).equals(PNG)).toBe(true);
        expect(seen["host"]).toBe(`fake.test:${port}`);
        for (const bad of ["cookie", "authorization", "referer", "origin"])
          expect(seen[bad]).toBeUndefined();
        // 証明書の名前が違えば（別のホスト名で同じアドレスへ）失敗する＝ホスト名で検証している
        await expect(
          makeRealRequest({ ca: cert })({
            url: new URL(`https://other.test:${port}/a.png`),
            address: "127.0.0.1",
            family: 4,
            headers: {},
            signal: sig(),
          }),
        ).rejects.toThrow();
      } finally {
        await new Promise((r) => server.close(r));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
