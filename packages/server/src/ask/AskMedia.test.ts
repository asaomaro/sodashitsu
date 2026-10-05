import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ASK_MEDIA_FILE_MAX,
  ASK_MEDIA_FILES_MAX,
  ASK_MEDIA_SERVER_MAX,
  ASK_MEDIA_TEXT_MAX,
  ASK_MEDIA_TOTAL_MAX,
  askByteLimits,
  normalizeAskSpec,
  type AskSpec,
} from "@sodashitsu/protocol";
import { AskMedia, type ImageFetcher } from "./AskMedia.js";

const PNG = Buffer.concat([
  Buffer.from([0x89]),
  Buffer.from("PNG\r\n"),
  Buffer.from([0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const WAV = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WAVEfmt "),
  Buffer.alloc(16),
]);
const SVG = Buffer.from(
  "<svg xmlns='http://www.w3.org/2000/svg'><script>window.__x=1</script></svg>",
);

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "soda-askmedia-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
const p = (n: string): string => join(dir, n);

const noFetch: ImageFetcher = {
  fetchImage: () => Promise.reject(new Error("no network in this test")),
};
const media = (fetcher: ImageFetcher = noFetch): AskMedia => new AskMedia({ fetcher });
const spec = (options: Record<string, unknown>[], extra: Record<string, unknown> = {}): AskSpec => {
  const r = normalizeAskSpec({ questions: [{ id: "a", label: "A", options }], ...extra });
  if (!r.ok) throw new Error(r.message);
  return r.spec;
};
const signal = (): AbortSignal => new AbortController().signal;
const rejects = async (s: AskSpec, m = media()): Promise<string> => {
  try {
    await m.prepare(s, signal());
  } catch (e) {
    expect((e as { code?: string }).code).toBe("invalid_ask_spec");
    return (e as Error).message;
  }
  throw new Error("expected invalid_ask_spec");
};

describe("AskMedia.prepare — ローカルのファイル", () => {
  it("画像・音を読み、参照を media:<id> に付け替える。MIME は先頭バイトから", async () => {
    await writeFile(p("a.png"), PNG);
    await writeFile(p("a.wav"), WAV);
    await writeFile(p("a.svg"), SVG);
    const r = await media().prepare(
      spec([
        { value: "x", image: p("a.png"), audio: p("a.wav") },
        { value: "y", image: p("a.svg") },
        { value: "z", image: p("a.png") },
      ]),
      signal(),
    );
    const opts = r.spec.questions[0]!.options;
    expect(opts.map((o) => [o.image, o.audio])).toEqual([
      ["media:0", "media:1"],
      ["media:2", undefined],
      ["media:0", undefined],
    ]); // 同じファイルは 1 つ
    expect(r.media.map((m) => [m.info.kind, m.info.mime, m.info.bytes])).toEqual([
      ["image", "image/png", PNG.length],
      ["audio", "audio/wav", WAV.length],
      ["image", "image/svg+xml", SVG.length],
    ]);
    expect(r.totalBytes).toBe(PNG.length + WAV.length + SVG.length);
    expect(r.warnings).toBe(0);
    expect(r.view).toBeUndefined();
    expect(r.spec).not.toHaveProperty("view");
  });
  it("メディアの無い定義はそのまま（media 空）", async () => {
    const s = spec([{ value: "x" }]);
    const r = await media().prepare(s, signal());
    expect(r.media).toEqual([]);
    expect(r.spec).toEqual(s);
  });
  it("存在しない・許可外の拡張子・偽装（.png の名のテキスト）・種類違い（画像の欄に音）は誤り", async () => {
    await writeFile(p("fake.png"), "root:x:0:0:root:/root:/bin/bash\n");
    await writeFile(p("note.txt"), "x");
    await writeFile(p("a2.png"), PNG);
    await writeFile(p("wavext.mp3"), WAV);
    expect(await rejects(spec([{ value: "x", image: p("missing.png") }]))).toMatch(
      /file not found/,
    );
    expect(await rejects(spec([{ value: "x", image: p("note.txt") }]))).toMatch(/extension/);
    expect(await rejects(spec([{ value: "x", image: p("fake.png") }]))).toMatch(/does not match/);
    expect(await rejects(spec([{ value: "x", image: p("wavext.mp3") }]))).toMatch(/does not match/);
    expect(await rejects(spec([{ value: "x", audio: p("a2.png") }]))).toMatch(
      /not match|not audio/,
    );
  });
  it("通常のファイルだけ: ディレクトリ・FIFO は誤り。シンボリックリンクは辿る", async () => {
    await mkdir(p("d.png"));
    expect(await rejects(spec([{ value: "x", image: p("d.png") }]))).toMatch(/not a regular file/);
    execFileSync("mkfifo", [p("f.png")]);
    expect(await rejects(spec([{ value: "x", image: p("f.png") }]))).toMatch(/not a regular file/);
    await writeFile(p("real.png"), PNG);
    await symlink(p("real.png"), p("link.png"));
    const r = await media().prepare(spec([{ value: "x", image: p("link.png") }]), signal());
    expect(r.media).toHaveLength(1);
  });
  it("1 ファイルの上限: ちょうどは通り、+1 は誤り", async () => {
    const ok = Buffer.concat([PNG, Buffer.alloc(ASK_MEDIA_FILE_MAX - PNG.length)]);
    await writeFile(p("max.png"), ok);
    await writeFile(p("max1.png"), Buffer.concat([ok, Buffer.alloc(1)]));
    expect(
      (await media().prepare(spec([{ value: "x", image: p("max.png") }]), signal())).media[0]!.info
        .bytes,
    ).toBe(ASK_MEDIA_FILE_MAX);
    expect(await rejects(spec([{ value: "x", image: p("max1.png") }]))).toMatch(/larger than/);
  });
  it("質問の合計 24 MiB: 超えれば誤り（個別の上限以内でも）", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(ASK_MEDIA_FILE_MAX - PNG.length)]);
    for (const n of ["b1", "b2", "b3", "b4"]) await writeFile(p(`${n}.png`), big);
    expect(
      (
        await media().prepare(
          spec([1, 2, 3].map((i) => ({ value: `v${i}`, image: p(`b${i}.png`) }))),
          signal(),
        )
      ).totalBytes,
    ).toBe(ASK_MEDIA_TOTAL_MAX);
    expect(
      await rejects(spec([1, 2, 3, 4].map((i) => ({ value: `v${i}`, image: p(`b${i}.png`) })))),
    ).toMatch(/in total/);
  });
  it("個数 32: ちょうどは通り、33 は誤り（同じファイルは数えない）", async () => {
    await writeFile(p("s.png"), PNG);
    const many = async (n: number) => {
      const opts = [];
      for (let i = 0; i < n; i++) {
        await writeFile(p(`m${i}.png`), Buffer.concat([PNG, Buffer.from([i])]));
        opts.push({ value: `v${i}`, image: p(`m${i}.png`) });
      }
      return spec(opts);
    };
    expect((await media().prepare(await many(ASK_MEDIA_FILES_MAX), signal())).media).toHaveLength(
      ASK_MEDIA_FILES_MAX,
    );
    expect(await rejects(await many(ASK_MEDIA_FILES_MAX + 1))).toMatch(/more than 32/);
    const same = spec(
      Array.from({ length: 40 }, (_, i) => ({ value: `v${i}`, image: p("s.png") })),
    );
    expect((await media().prepare(same, signal())).media).toHaveLength(1);
  });
});

describe("AskMedia.prepare — data:", () => {
  const data = (mime: string, b: Buffer): string => `data:${mime};base64,${b.toString("base64")}`;
  it("MIME と先頭バイトが合えば通り、合わなければ誤り", async () => {
    const r = await media().prepare(
      spec([{ value: "x", image: data("image/png", PNG) }]),
      signal(),
    );
    expect(r.media[0]!.info).toMatchObject({ kind: "image", mime: "image/png" });
    expect(
      await rejects(spec([{ value: "x", image: data("image/png", Buffer.from("not an image")) }])),
    ).toMatch(/does not match/);
    expect(await rejects(spec([{ value: "x", image: data("image/jpeg", PNG) }]))).toMatch(
      /does not match/,
    );
    expect(await rejects(spec([{ value: "x", audio: data("audio/wav", PNG) }]))).toMatch(
      /does not match/,
    );
  });
});

describe("AskMedia.prepare — 外部 URL（偽の取得）", () => {
  const URL1 = "https://example.com/a.png";
  it("取れた画像は保持する。取れなかった画像は参照を外して数える（質問は出る）", async () => {
    const fetcher: ImageFetcher = {
      fetchImage: async (url) => {
        if (url === URL1) return { bytes: PNG, contentType: "image/png" };
        throw new Error("down");
      },
    };
    const r = await media(fetcher).prepare(
      spec([
        { value: "x", image: URL1 },
        { value: "y", image: "https://example.com/b.png" },
        { value: "z" },
      ]),
      signal(),
    );
    expect(r.spec.questions[0]!.options.map((o) => o.image)).toEqual([
      "media:0",
      undefined,
      undefined,
    ]);
    expect(r.warnings).toBe(1);
    expect(r.media).toHaveLength(1);
  });
  it("画像でない・大きすぎる取得結果も、失敗として外す", async () => {
    const r1 = await media({
      fetchImage: async () => ({ bytes: Buffer.from("<html>"), contentType: "image/png" }),
    }).prepare(spec([{ value: "x", image: URL1 }]), signal());
    expect(r1.warnings).toBe(1);
    const huge = Buffer.concat([PNG, Buffer.alloc(ASK_MEDIA_FILE_MAX)]);
    const r2 = await media({
      fetchImage: async () => ({ bytes: huge, contentType: "image/png" }),
    }).prepare(spec([{ value: "x", image: URL1 }]), signal());
    expect(r2.warnings).toBe(1);
  });
  it("取得の宛先はホスト名だけをログに残す（パス・クエリ・URL の全文は残さない）", async () => {
    const lines: { msg: string; f?: Record<string, unknown> }[] = [];
    const m = new AskMedia({
      fetcher: { fetchImage: async () => ({ bytes: PNG, contentType: "image/png" }) },
      logger: { info: (msg, f) => void lines.push({ msg, ...(f ? { f } : {}) }) },
    });
    await m.prepare(spec([{ value: "x", image: "https://img.example.com/p/a.png?token=SECRET" }]), signal());
    expect(lines).toEqual([{ msg: "ask remote image fetch", f: { host: "img.example.com" } }]);
    expect(JSON.stringify(lines)).not.toMatch(/SECRET|a\.png/);
  });
  it("同じ URL は 1 回だけ取る", async () => {
    let calls = 0;
    const r = await media({
      fetchImage: async () => (calls++, { bytes: PNG, contentType: "image/png" }),
    }).prepare(
      spec([
        { value: "x", image: URL1 },
        { value: "y", image: URL1 },
      ]),
      signal(),
    );
    expect(calls).toBe(1);
    expect(r.media).toHaveLength(1);
  });
  it("中断（signal）されたら投げる", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      media().prepare(spec([{ value: "x", image: p("a.png") }]), c.signal),
    ).rejects.toThrow();
  });
});

describe("AskMedia.prepare — 外部 URL の受け取り中の合計（取り終えるのを待たずに止める）", () => {
  const MIB = 1024 * 1024;
  const urls = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ value: `v${i}`, image: `https://example.com/${i}.png` }));
  /** 256 KiB ずつ `mib` MiB 分を受け取る偽の取得器。受け取るたびに知らせ、中止されたらそこで止まる。 */
  const streaming = (mib: number, stats = { reported: 0, aborted: 0, completed: 0 }) => ({
    stats,
    fetcher: {
      fetchImage: async (_url, sig, onBytes) => {
        const STEP = MIB / 4;
        for (let i = 0; i < mib * 4; i++) {
          if (sig.aborted) {
            stats.aborted++;
            throw new Error("aborted");
          }
          stats.reported += STEP;
          onBytes?.(STEP);
          await new Promise((r) => setImmediate(r));
        }
        stats.completed++;
        return { bytes: Buffer.concat([PNG, Buffer.alloc(mib * MIB - PNG.length)]), contentType: "image/png" };
      },
    } satisfies ImageFetcher,
  });

  it("質問の合計 24 MiB を、取り終える前の受け取りで超えたら、残りの取得を中止して誤りにする。溜めた分は戻る", async () => {
    const { fetcher, stats } = streaming(7); // 7 MiB × 4 件 = 28 MiB
    const m = media(fetcher);
    await expect(m.prepare(spec(urls(4)), signal())).rejects.toMatchObject({
      code: "invalid_ask_spec",
    });
    await new Promise((r) => setTimeout(r, 30)); // 中止された取得が次の周で止まるのを待つ
    expect(stats.completed).toBe(0); // どれも取り終えていない
    expect(stats.aborted).toBeGreaterThan(0); // 途中で中止された
    expect(stats.reported).toBeLessThanOrEqual(ASK_MEDIA_TOTAL_MAX + 4 * MIB); // 受け取った量は上限の少し先まで
    expect(m.inflightBytes).toBe(0);
  });
  it("サーバ全体の上限は、取得中の分も含めて判定する（保持している分との合計）。超えたら ask_busy", async () => {
    const { fetcher, stats } = streaming(4);
    const m = media(fetcher);
    await expect(
      m.prepare(spec(urls(2)), signal(), () => ASK_MEDIA_SERVER_MAX - 3 * MIB),
    ).rejects.toMatchObject({ code: "ask_busy" });
    expect(stats.completed).toBe(0);
    expect(m.inflightBytes).toBe(0);
  });
  it("別の質問の取得中の分も、サーバ全体に数える（同時に 2 つの質問）", async () => {
    const m = media(streaming(4).fetcher);
    const held = ASK_MEDIA_SERVER_MAX - 6 * MIB; // 1 つなら 4 MiB で収まる。2 つ同時だと 8 MiB で超える
    const [a, b] = await Promise.allSettled([
      m.prepare(spec(urls(1)), signal(), () => held),
      m.prepare(spec(urls(1)), signal(), () => held),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(m.inflightBytes).toBe(0);
  });
  it("取得に失敗した画像の受け取り済みの分は戻る（失敗は画像なし。合計を食わない）", async () => {
    const m = media({
      fetchImage: async (url, _sig, onBytes) => {
        if (url.endsWith("/0.png")) {
          onBytes?.(20 * MIB);
          throw new Error("down");
        }
        onBytes?.(PNG.length);
        return { bytes: PNG, contentType: "image/png" };
      },
    });
    const r = await m.prepare(spec(urls(2)), signal());
    expect(r.warnings).toBe(1);
    expect(r.media).toHaveLength(1);
    expect(m.inflightBytes).toBe(0);
  });
  it("受け取りを知らせない取得器でも、取り終えた時点で合計に数える", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(7 * MIB)]);
    const m = media({ fetchImage: async () => ({ bytes: big, contentType: "image/png" }) });
    await expect(m.prepare(spec(urls(4)), signal())).rejects.toMatchObject({
      code: "invalid_ask_spec",
    });
    expect(m.inflightBytes).toBe(0);
  });
});

describe("AskMedia.prepare — view", () => {
  it("text・markdown・html・画像・テキストファイルを種類ごとに保持し、AskPending.view の形にする", async () => {
    await writeFile(p("d.md"), "# 見出し\n");
    await writeFile(p("d.html"), "<!doctype html><p>x</p>");
    await writeFile(p("d.txt"), "plain");
    await writeFile(p("v.png"), PNG);
    const s = spec([{ value: "x" }], {
      view: [
        { file: p("d.md") },
        { file: p("d.md"), raw: true, title: "raw" },
        { file: p("d.html") },
        { file: p("d.txt") },
        { file: p("v.png") },
        { text: "その場の文字" },
      ],
    });
    const r = await media().prepare(s, signal());
    expect(r.view!.map((v) => [v.title, v.kind])).toEqual([
      ["d.md", "markdown"],
      ["raw", "text"],
      ["d.html", "html"],
      ["d.txt", "text"],
      ["v.png", "image"],
      ["テキスト", "text"],
    ]);
    expect(r.media[r.view![0]!.media]!.bytes.toString()).toBe("# 見出し\n");
    expect(r.spec).not.toHaveProperty("view");
  });
  it("Markdown・テキストは 2 MiB まで、html は 8 MiB まで。バイナリ・UTF-8 でないものは誤り", async () => {
    await writeFile(p("ok.md"), Buffer.alloc(ASK_MEDIA_TEXT_MAX, "a"));
    await writeFile(p("big.md"), Buffer.alloc(ASK_MEDIA_TEXT_MAX + 1, "a"));
    await writeFile(p("big.html"), Buffer.alloc(ASK_MEDIA_TEXT_MAX + 1, "a"));
    await writeFile(p("bin.txt"), Buffer.from([0x41, 0, 0x42]));
    await writeFile(p("latin.txt"), Buffer.from([0xff, 0xfe, 0x41]));
    const v = (file: string) => spec([{ value: "x" }], { view: { file } });
    expect((await media().prepare(v(p("ok.md")), signal())).media).toHaveLength(1);
    expect(await rejects(v(p("big.md")))).toMatch(/larger than/);
    expect((await media().prepare(v(p("big.html")), signal())).view![0]!.kind).toBe("html");
    expect(await rejects(v(p("bin.txt")))).toMatch(/UTF-8/);
    expect(await rejects(v(p("latin.txt")))).toMatch(/UTF-8/);
    expect(await rejects(v(p("missing.md")))).toMatch(/file not found/);
  });
  it("text の成果物は定義の一部なので、定義全体の 256 KiB で止まる（大きいものは file で渡す）", () => {
    const r = normalizeAskSpec({
      questions: [{ id: "a", label: "A", options: ["x"] }],
      view: { text: "a".repeat(300_000) },
    });
    expect(r).toMatchObject({ ok: false, reason: "too_large" });
  });

  describe("ローカル起動（unlimited）: 大きさの上限が外れる（20261005-ask-local-no-limit）", () => {
    const MIB = 1024 * 1024;
    const v = (file: string) => spec([{ value: "x" }], { view: { file } });
    const prep = (s: AskSpec, unlimited: boolean) => media().prepare(s, signal(), () => 0, unlimited);
    it("9 MiB の html: 従来（外向き）は誤り、ローカルでは通る（統合: 実ファイルを読む）", async () => {
      await writeFile(p("nine.html"), Buffer.alloc(9 * MIB, "a"));
      expect(await rejects(v(p("nine.html")))).toMatch(/larger than 8388608/);
      const r = await prep(v(p("nine.html")), true);
      expect(r.view![0]!.kind).toBe("html");
      expect(r.media[0]!.info.bytes).toBe(9 * MIB);
    });
    it("3 MiB の Markdown・9 MiB の画像・合計 30 MiB も、ローカルでは通り、従来では誤り", async () => {
      await writeFile(p("three.md"), Buffer.alloc(3 * MIB, "a"));
      expect(await rejects(v(p("three.md")))).toMatch(/larger than 2097152/);
      expect((await prep(v(p("three.md")), true)).media).toHaveLength(1);
      await writeFile(p("nine.png"), Buffer.concat([PNG, Buffer.alloc(9 * MIB - PNG.length)]));
      expect(await rejects(spec([{ value: "x", image: p("nine.png") }]))).toMatch(/larger than 8388608/);
      expect((await prep(spec([{ value: "x", image: p("nine.png") }]), true)).media[0]!.info.bytes).toBe(9 * MIB);
      for (const n of ["u1", "u2", "u3", "u4"]) await writeFile(p(`${n}.html`), Buffer.alloc(8 * MIB, "a"));
      const four = spec([{ value: "x" }], { view: ["u1", "u2", "u3", "u4"].map((n) => ({ file: p(`${n}.html`) })) });
      await expect(media().prepare(four, signal())).rejects.toThrow(/in total/);
      expect((await prep(four, true)).totalBytes).toBe(32 * MIB);
    });
    it("個数（32）と view の件数は、ローカルでも変わらない", async () => {
      // 同じファイルは 1 つに数えるので、33 個の別のファイルを作る
      const files: string[] = [];
      for (let i = 0; i < 33; i++) {
        await writeFile(p(`many${i}.png`), Buffer.concat([PNG, Buffer.alloc(i)]));
        files.push(p(`many${i}.png`));
      }
      const s33 = spec(files.map((f, i) => ({ value: String(i), image: f })));
      await expect(prep(s33, true)).rejects.toThrow(/more than 32/);
    });
    it("安全弁: ローカルの実効の上限は 100 MiB（1 ファイル）・200 MiB（質問）・400 MiB（サーバ）", () => {
      expect(askByteLimits(true)).toEqual({ file: 100 * MIB, text: 100 * MIB, total: 200 * MIB, server: 400 * MIB });
      expect(askByteLimits(false)).toEqual({ file: 8 * MIB, text: 2 * MIB, total: 24 * MIB, server: 128 * MIB });
    });
  });
});
