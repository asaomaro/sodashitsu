import { Terminal } from "@xterm/xterm";
import type { ILink } from "@xterm/xterm";
import type { ResolvedFile } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createFileLinkProvider, findPathCandidates } from "./fileLinks.js";

/** 拾った範囲の文字列と、確かめるパス。 */
function found(text: string): [string, string[]][] {
  return findPathCandidates(text).map((c) => [text.slice(c.start, c.end), c.paths]);
}

describe("findPathCandidates", () => {
  it("区切りを含む語・拡張子を持つ語を拾う（絶対・相対・~・Windows のドライブ）", () => {
    expect(found("open /etc/hosts and src/main.ts or ./a/b and ~/notes.txt README.md")).toEqual([
      ["/etc/hosts", ["/etc/hosts"]],
      ["src/main.ts", ["src/main.ts"]],
      ["./a/b", ["./a/b"]],
      ["~/notes.txt", ["~/notes.txt"]],
      ["README.md", ["README.md"]],
    ]);
    expect(found("at C:\\Users\\me\\a.txt and ..\\b.txt")).toEqual([
      ["C:\\Users\\me\\a.txt", ["C:\\Users\\me\\a.txt"]],
      ["..\\b.txt", ["..\\b.txt"]],
    ]);
  });

  it("後ろの行番号・列をリンクの範囲に含め、確かめるパスからは外す", () => {
    expect(found("src/a.ts:12:3 - error")).toEqual([["src/a.ts:12:3", ["src/a.ts"]]]);
    expect(found("src/a.ts:12: warning")).toEqual([["src/a.ts:12", ["src/a.ts"]]]);
    expect(found("src/a.ts(12,3): error TS1")).toEqual([["src/a.ts(12,3)", ["src/a.ts"]]]);
  });

  it("引用符・括弧・= の中のパスを拾い、文の終わりの . は外す", () => {
    expect(found('see "src/a.ts", (src/b.ts) --out=dist/c.js.')).toEqual([
      ["src/a.ts", ["src/a.ts"]],
      ["src/b.ts", ["src/b.ts"]],
      ["dist/c.js", ["dist/c.js"]],
    ]);
  });

  it("git diff の a/・b/ は、外したパスも確かめる", () => {
    expect(found("--- a/src/a.ts")).toEqual([["a/src/a.ts", ["a/src/a.ts", "src/a.ts"]]]);
    expect(found("+++ b/src/a.ts")).toEqual([["b/src/a.ts", ["b/src/a.ts", "src/a.ts"]]]);
  });

  it("ふつうの語・数・URL の中は拾わない", () => {
    expect(found("hello world 1.2.3 12/25 and https://example.com/a/b.html done")).toEqual([]);
    expect(found("..")).toEqual([]);
  });

  it("日本語の名前を拾う", () => {
    expect(found("出力: 資料/見積書.xlsx です")).toEqual([["資料/見積書.xlsx", ["資料/見積書.xlsx"]]]);
  });

  it("1 行から拾う数に上限がある（サーバへの 1 回の問い合わせに収まる）", () => {
    const line = Array.from({ length: 100 }, (_, i) => `d/f${i}.ts`).join(" ");
    expect(findPathCandidates(line).flatMap((c) => c.paths).length).toBeLessThanOrEqual(64);
  });
});

describe("createFileLinkProvider", () => {
  let term: Terminal | undefined;
  afterEach(() => term?.dispose());

  async function setup(cols: number, data: string, existing: Record<string, ResolvedFile>) {
    term = new Terminal({ cols, rows: 6, allowProposedApi: true });
    await new Promise<void>((r) => term!.write(data, () => r()));
    const asked: string[][] = [];
    const activated: ResolvedFile[] = [];
    const provider = createFileLinkProvider({
      term,
      resolve: async (paths) => {
        asked.push(paths);
        return paths.map((p) => existing[p] ?? null);
      },
      activate: (_ev, file) => void activated.push(file),
    });
    const links = (y: number): Promise<ILink[] | undefined> => new Promise((r) => provider.provideLinks(y, r));
    return { links, asked, activated };
  }

  const file = (path: string): ResolvedFile => ({ path, kind: "file", size: 1 });

  it("実在したパスだけをリンクにする（範囲は 1 始まり・終わりを含む。行番号まで）", async () => {
    const { links, asked, activated } = await setup(60, "err src/a.ts:12:3 and src/none.ts", { "src/a.ts": file("/w/src/a.ts") });
    const got = await links(1);
    expect(asked).toEqual([["src/a.ts", "src/none.ts"]]);
    expect(got).toHaveLength(1);
    expect(got![0]!.range).toEqual({ start: { x: 5, y: 1 }, end: { x: 17, y: 1 } });
    expect(got![0]!.text).toBe("/w/src/a.ts");
    got![0]!.activate(new MouseEvent("mouseup"), "");
    expect(activated).toEqual([file("/w/src/a.ts")]);
  });

  it("パスらしい語が無い行は、サーバに聞かない", async () => {
    const { links, asked } = await setup(60, "hello world", {});
    expect(await links(1)).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("折り返された行をつないで拾う（どちらの行から聞かれても同じ範囲）", async () => {
    // 20 桁：`see /very/long/path/t` で折り返し、`o/file.txt` が次の行。
    const { links } = await setup(20, "see /very/long/path/to/file.txt", { "/very/long/path/to/file.txt": file("/very/long/path/to/file.txt") });
    const range = { start: { x: 5, y: 1 }, end: { x: 11, y: 2 } };
    expect((await links(1))![0]!.range).toEqual(range);
    expect((await links(2))![0]!.range).toEqual(range);
  });

  it("全角の文字を含む行でも、セルの位置で範囲を返す", async () => {
    // 「出力」は 2 文字で 4 桁。`:` と空白の後、7 桁目から。
    const { links } = await setup(60, "出力: 資料/a.txt", { "資料/a.txt": file("/w/資料/a.txt") });
    expect((await links(1))![0]!.range).toEqual({ start: { x: 7, y: 1 }, end: { x: 16, y: 1 } });
  });

  it("別の行を聞かれた後に届いた、前の行の遅れた答えは返さない（今の行の判定に混ぜない）", async () => {
    term = new Terminal({ cols: 40, rows: 4, allowProposedApi: true });
    await new Promise<void>((r) => term!.write("src/a.ts\r\nsrc/b.ts", () => r()));
    const answers: ((files: (ResolvedFile | null)[]) => void)[] = [];
    const provider = createFileLinkProvider({
      term,
      resolve: () => new Promise((r) => answers.push(r)),
      activate: () => undefined,
    });
    const got: [number, ILink[] | undefined][] = [];
    provider.provideLinks(1, (links) => got.push([1, links]));
    provider.provideLinks(2, (links) => got.push([2, links]));
    answers[1]!([file("/w/src/b.ts")]);
    answers[0]!([file("/w/src/a.ts")]); // 前の行の答えが後から届く
    await new Promise((r) => setTimeout(r, 0));
    expect(got.map(([y, links]) => [y, links?.[0]?.text])).toEqual([[2, "/w/src/b.ts"]]);
  });

  it("全角の文字が行の終わりに収まらず次の行へ送られても、空いたセルを文字に数えずにつなぐ", async () => {
    // 10 桁：`dir/abcde` が 9 桁、次の「資」は 2 桁で収まらず、10 桁目を空けて次の行へ。
    const { links, asked } = await setup(10, "dir/abcde資料.txt", { "dir/abcde資料.txt": file("/w/dir/abcde資料.txt") });
    expect((await links(1))![0]!.range).toEqual({ start: { x: 1, y: 1 }, end: { x: 8, y: 2 } });
    expect(asked[0]).toEqual(["dir/abcde資料.txt"]);
  });

  it("確かめられなかったら（古いサーバ・切断）リンクにしない", async () => {
    term = new Terminal({ cols: 40, rows: 4, allowProposedApi: true });
    await new Promise<void>((r) => term!.write("src/a.ts", () => r()));
    const provider = createFileLinkProvider({ term, resolve: () => Promise.reject(new Error("not_found")), activate: () => undefined });
    expect(await new Promise((r) => provider.provideLinks(1, r))).toBeUndefined();
  });
});
