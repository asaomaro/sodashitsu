import { FILE_CHUNK_BYTES, FILE_MAX_BYTES, type MethodName, type ResolvedFile } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { InputGate } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { acceptsDrop, FileTransfer, loadFileLocality, readDropPayload, type DropPayload, type FileLocality } from "./FileTransfer.js";
import type { PasteTerminal } from "./ImagePaster.js";

type Req = [string, Record<string, unknown>];

interface ServerOpts {
  info?: { sameMachine: boolean; canOpen: boolean } | "unsupported";
  /** サーバに実在するパス。 */
  existing?: Record<string, ResolvedFile>;
  /** `file.read` で返す中身（パスごと）。 */
  contents?: Record<string, Uint8Array>;
  failOn?: { method: string; code: string; after?: number };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 偽のサーバ：`file.*` を受けて、送られたファイルを覚える。 */
function makeConn(o: ServerOpts = {}) {
  const requests: Req[] = [];
  const sent: [string, string | Uint8Array][] = [];
  const uploaded: { name: string; bytes: number[] }[] = [];
  let failCount = 0;
  const conn: ConnectionPort = {
    request: vi.fn(async (method: MethodName, params: unknown) => {
      const p = params as Record<string, unknown>;
      requests.push([method, p]);
      if (o.failOn && o.failOn.method === method && failCount++ >= (o.failOn.after ?? 0))
        throw Object.assign(new Error(`${o.failOn.code}: x`), { code: o.failOn.code });
      switch (method) {
        case "file.info":
          if (o.info === "unsupported") throw Object.assign(new Error("not_found: unknown method"), { code: "not_found" });
          return o.info ?? { sameMachine: false, canOpen: false };
        case "file.resolve":
          return { files: (p["paths"] as string[]).map((path) => o.existing?.[path] ?? null) };
        case "file.read": {
          const all = o.contents?.[p["path"] as string] ?? new Uint8Array();
          const part = all.subarray(p["offset"] as number, (p["offset"] as number) + FILE_CHUNK_BYTES);
          return { data: toBase64(part), size: all.length, mtimeMs: 1 };
        }
        case "file.upload.begin":
          uploaded.push({ name: p["name"] as string, bytes: [] });
          return { uploadId: `u${uploaded.length}` };
        case "file.upload.chunk":
          for (const ch of atob(p["data"] as string)) uploaded.at(-1)!.bytes.push(ch.charCodeAt(0));
          return {};
        case "file.upload.commit":
          return { path: `/state/dropped-files/d${uploaded.length}/${uploaded.at(-1)!.name}` };
        default:
          return {};
      }
    }) as ConnectionPort["request"],
    sendInput: (paneId, bytes) => void sent.push([paneId, bytes]),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
  return { conn, requests, sent, uploaded };
}

function makeTerm(bracketed: boolean): PasteTerminal {
  return { paste: () => undefined, modes: { bracketedPasteMode: bracketed }, options: {} };
}

function setup(o: ServerOpts & { locality?: FileLocality; localMachine?: boolean; os?: "posix" | "windows"; bracketed?: boolean; paneExists?: boolean } = {}) {
  const c = makeConn(o);
  const gate = new InputGate(c.conn);
  const toasts: string[] = [];
  const saved: { name: string; blob: Blob }[] = [];
  const state = { locality: o.locality ?? "auto", localMachine: o.localMachine ?? true };
  const transfer = new FileTransfer({
    conn: gate,
    input: gate,
    terminalOf: () => makeTerm(o.bracketed ?? false),
    toast: (m) => void toasts.push(m),
    paneExists: () => o.paneExists ?? true,
    locality: () => state.locality,
    isLocalMachine: () => state.localMachine,
    hostOs: () => o.os ?? "posix",
    hostname: () => "host",
    saveBlob: (blob, name) => void saved.push({ name, blob }),
  });
  return { ...c, gate, toasts, saved, transfer, state };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function idle(): Promise<void> {
  for (let i = 0; i < 30; i++) await settle();
}

function dropped(name: string, body: string | Uint8Array<ArrayBuffer>, directory = false): DropPayload["files"][number] {
  return { file: new File([body], name), directory };
}
const payload = (p: Partial<DropPayload>): DropPayload => ({ files: [], uris: [], text: "", ...p });
const methods = (reqs: Req[]): string[] => reqs.map((r) => r[0]);
const file = (path: string, size = 5): ResolvedFile => ({ path, kind: "file", size });

describe("loadFileLocality", () => {
  it("知らない値は自動", () => {
    expect(["auto", "local", "remote", "x", undefined, 1].map(loadFileLocality)).toEqual(["auto", "local", "remote", "auto", "auto", "auto"]);
  });
});

describe("FileTransfer — 同じマシンかの判定", () => {
  it("自動はサーバの判定に従う。設定で上書きできる。別のマシン（SSH）を開いている間は常に別のマシン", async () => {
    const s = setup({ info: { sameMachine: true, canOpen: true } });
    expect(s.transfer.isLocal()).toBe(false); // まだ聞いていない
    s.transfer.onOpened();
    await idle();
    expect(s.transfer.isLocal()).toBe(true);
    s.state.locality = "remote";
    expect(s.transfer.isLocal()).toBe(false);
    s.state.locality = "local";
    s.state.localMachine = false;
    expect(s.transfer.isLocal()).toBe(false);

    const far = setup({ info: { sameMachine: false, canOpen: true } });
    far.transfer.onOpened();
    await idle();
    expect(far.transfer.isLocal()).toBe(false);
    far.state.locality = "local";
    expect(far.transfer.isLocal()).toBe(true);
  });
});

// 1 片（768 KiB）を超える中身を扱う試験は、happy-dom の Blob の読み取りがほかの試験と並ぶと遅いので、時間切れを長く取る。
describe("FileTransfer — リンク", () => {
  it("同じマシン: サーバのマシンのアプリで開く（ダウンロードしない）", async () => {
    const s = setup({ info: { sameMachine: true, canOpen: true } });
    s.transfer.onOpened();
    await idle();
    s.transfer.open(file("/w/a.txt"));
    await idle();
    expect(s.requests.slice(1)).toEqual([["file.open", { path: "/w/a.txt" }]]);
    expect(s.saved).toEqual([]);
    expect(s.toasts).toEqual([]);
  });

  it("別のマシン: 分けて受け取り、ブラウザのダウンロードにする（中身は元のバイト列と同じ）", async () => {
    const data = new Uint8Array(FILE_CHUNK_BYTES + 500).map((_, i) => (i * 7) & 0xff);
    const s = setup({ info: { sameMachine: false, canOpen: true }, contents: { "/w/out/big.bin": data } });
    s.transfer.onOpened();
    await idle();
    s.transfer.open(file("/w/out/big.bin", data.length));
    await vi.waitFor(() => expect(s.saved).toHaveLength(1), { timeout: 25_000 });
    expect(methods(s.requests.slice(1))).toEqual(["file.read", "file.read"]);
    expect(s.requests[2]![1]).toEqual({ path: "/w/out/big.bin", offset: FILE_CHUNK_BYTES });
    expect(s.saved).toHaveLength(1);
    expect(s.saved[0]!.name).toBe("big.bin");
    expect(new Uint8Array(await s.saved[0]!.blob.arrayBuffer())).toEqual(data);
  }, 30_000);

  it("同じマシンでも開く手段が無ければ（画面の無いサーバ・コンテナ）、ダウンロードにする", async () => {
    const known = setup({ info: { sameMachine: true, canOpen: false }, contents: { "/w/a.txt": new Uint8Array([1, 2]) } });
    known.transfer.onOpened();
    await idle();
    known.transfer.open(file("/w/a.txt", 2));
    await idle();
    expect(methods(known.requests.slice(1))).toEqual(["file.read"]); // 開けないと分かっているので聞かない
    expect(known.saved).toHaveLength(1);

    // 「同じマシンとして扱う」を選んでいれば開いてみて、手段が無いと返ったらダウンロードへ切り替える。
    const forced = setup({
      locality: "local",
      info: { sameMachine: false, canOpen: false },
      contents: { "/w/a.txt": new Uint8Array([1, 2]) },
      failOn: { method: "file.open", code: "file_open_unavailable" },
    });
    forced.transfer.onOpened();
    await idle();
    forced.transfer.open(file("/w/a.txt", 2));
    await idle();
    expect(methods(forced.requests.slice(1))).toEqual(["file.open", "file.read"]);
    expect(forced.saved).toHaveLength(1);
    expect(forced.toasts).toEqual([]);
  });

  it("開けなかった理由（実行できる種類・失敗）は toast で示し、ダウンロードへは切り替えない", async () => {
    const s = setup({ info: { sameMachine: true, canOpen: true }, failOn: { method: "file.open", code: "file_open_refused" } });
    s.transfer.onOpened();
    await idle();
    s.transfer.open(file("/w/setup.exe"));
    await idle();
    expect(s.toasts).toEqual(["実行できる種類のファイルは、サーバのマシンのアプリでは開きません"]);
    expect(s.saved).toEqual([]);
  });

  it("フォルダ・大きすぎるファイルはダウンロードしない", async () => {
    const s = setup();
    await s.transfer.download({ path: "/w/dir", kind: "dir", size: 0 });
    await s.transfer.download(file("/w/huge.bin", FILE_MAX_BYTES + 1));
    expect(s.requests).toEqual([]);
    expect(s.toasts).toEqual(["フォルダはダウンロードできません", "ファイルが大きすぎます（256MB まで）"]);
  });

  it("受け取っている間にファイルが変わったら、やめる", async () => {
    const s = setup();
    let n = 0;
    (s.conn.request as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ data: btoa("abc"), size: 6 + n, mtimeMs: n++ }));
    await s.transfer.download(file("/w/a.log", 6));
    expect(s.saved).toEqual([]);
    expect(s.toasts).toEqual(["受け取っている間にファイルが変わったため、ダウンロードをやめました"]);
  });

  it("サーバ（中継先を含む）が、確かめた大きさと違う・終わりを越える答えを返したら、受け取り続けない", async () => {
    const s = setup();
    (s.conn.request as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ data: btoa("abcd"), size: 1e12, mtimeMs: 1 }));
    await s.transfer.download(file("/w/a.log", 6));
    const over = setup();
    (over.conn.request as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ data: btoa("abcd"), size: 6, mtimeMs: 1 }));
    await over.transfer.download(file("/w/a.log", 6));
    for (const t of [s, over]) {
      expect(t.saved).toEqual([]);
      expect(t.toasts).toEqual(["受け取っている間にファイルが変わったため、ダウンロードをやめました"]);
    }
    expect(s.conn.request).toHaveBeenCalledTimes(1);
    expect(over.conn.request).toHaveBeenCalledTimes(2);
  });

  it("ほかのホストの file: のリンク（pane の中の ssh の先で出たもの）は扱わない", async () => {
    const s = setup({ existing: { "/etc/hosts": file("/etc/hosts") } });
    s.transfer.openUri("p1", "file://elsewhere/etc/hosts");
    await idle();
    expect(s.requests).toEqual([]);
  });

  it("OSC 8 の file: のリンクは、サーバで実在を確かめてから開く。無ければ知らせる", async () => {
    const s = setup({ info: { sameMachine: true, canOpen: true }, existing: { "/w/my file.txt": file("/w/my file.txt") } });
    s.transfer.onOpened();
    await idle();
    s.transfer.openUri("p1", "file://host/w/my%20file.txt");
    s.transfer.openUri("p1", "file:///w/none.txt");
    await idle();
    expect(s.requests.filter((r) => r[0] === "file.open")).toEqual([["file.open", { path: "/w/my file.txt" }]]);
    expect(s.toasts).toEqual(["ファイルが見つかりませんでした"]);
  });

  it("確かめた答えは短い間使い回し（同じ行の上を動くたびに聞かない）、対応していないサーバには聞かない", async () => {
    const s = setup({ existing: { "a.ts": file("/w/a.ts") } });
    expect(await s.transfer.resolve("p1", ["a.ts", "b.ts"])).toEqual([file("/w/a.ts"), null]);
    expect(await s.transfer.resolve("p1", ["b.ts", "a.ts", "c.ts"])).toEqual([null, file("/w/a.ts"), null]);
    expect(s.requests).toEqual([
      ["file.resolve", { paneId: "p1", paths: ["a.ts", "b.ts"] }],
      ["file.resolve", { paneId: "p1", paths: ["c.ts"] }],
    ]);
    // 別の pane は場所が違う——使い回さない。
    await s.transfer.resolve("p2", ["a.ts"]);
    expect(s.requests).toHaveLength(3);

    const old = setup({ info: "unsupported" });
    old.transfer.onOpened();
    await idle();
    expect(await old.transfer.resolve("p1", ["a.ts"])).toEqual([null]);
    expect(methods(old.requests)).toEqual(["file.info"]);
  });
});

describe("FileTransfer — ドロップ", () => {
  it("別のマシン: 分けて送り、置いた先のパスを引用して貼る。送っている間に打ったキーはパスの後に届く", async () => {
    const body = new Uint8Array(FILE_CHUNK_BYTES + 10).map((_, i) => (i * 3) & 0xff);
    const s = setup({ bracketed: true });
    s.transfer.drop("p1", payload({ files: [dropped("my report.pdf", body), dropped("b.txt", "bb")] }));
    s.gate.sendInput("p1", "x");
    // 1 片を超える大きさの読み取りと符号化は、ほかの試験と並んで走ると時間がかかる——貼られるまで待つ。
    await vi.waitFor(() => expect(s.sent).toHaveLength(2), { timeout: 25_000 });
    expect(methods(s.requests)).toEqual([
      "file.upload.begin",
      "file.upload.chunk",
      "file.upload.chunk",
      "file.upload.commit",
      "file.upload.begin",
      "file.upload.chunk",
      "file.upload.commit",
    ]);
    expect(s.requests[0]![1]).toEqual({ paneId: "p1", name: "my report.pdf", size: body.length });
    expect(new Uint8Array(s.uploaded[0]!.bytes)).toEqual(body);
    expect(s.sent).toEqual([
      ["p1", "\x1b[200~'/state/dropped-files/d1/my report.pdf' /state/dropped-files/d2/b.txt \x1b[201~"],
      ["p1", "x"],
    ]);
  }, 30_000);

  it("同じマシンで元のパスが分かれば（file: の URI がサーバで実在し、大きさが合う）、送らずにそのパスを貼る", async () => {
    const s = setup({ info: { sameMachine: true, canOpen: true }, existing: { "/home/me/my file.txt": file("/home/me/my file.txt", 2) } });
    s.transfer.onOpened();
    await idle();
    s.transfer.drop("p1", payload({ files: [dropped("my file.txt", "ab")], uris: ["file:///home/me/my%20file.txt"] }));
    await idle();
    expect(methods(s.requests.slice(1))).toEqual(["file.resolve"]);
    expect(s.sent).toEqual([["p1", "'/home/me/my file.txt' "]]);
  });

  it("同じマシンでも、元のパスが分からない（Chromium）・サーバに無い・大きさが違うなら送る", async () => {
    for (const p of [
      payload({ files: [dropped("a.txt", "ab")] }),
      payload({ files: [dropped("a.txt", "ab")], uris: ["file:///other/a.txt"] }),
      payload({ files: [dropped("a.txt", "abc")], uris: ["file:///home/me/a.txt"] }),
    ]) {
      const s = setup({ info: { sameMachine: true, canOpen: true }, existing: { "/home/me/a.txt": file("/home/me/a.txt", 2) } });
      s.transfer.onOpened();
      await idle();
      s.transfer.drop("p1", p);
      await idle();
      expect(methods(s.requests).filter((m) => m.startsWith("file.upload"))).toEqual(["file.upload.begin", "file.upload.chunk", "file.upload.commit"]);
      expect(s.sent).toEqual([["p1", "/state/dropped-files/d1/a.txt "]]);
    }
  });

  it("別のマシンでは、file: の URI があっても元のパスは使わない（そのパスはブラウザのマシンのもの）", async () => {
    const s = setup({ info: { sameMachine: false, canOpen: true }, existing: { "/home/me/a.txt": file("/home/me/a.txt", 2) } });
    s.transfer.onOpened();
    await idle();
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "ab")], uris: ["file:///home/me/a.txt"] }));
    await idle();
    expect(methods(s.requests)).not.toContain("file.resolve");
    expect(s.sent).toEqual([["p1", "/state/dropped-files/d1/a.txt "]]);
  });

  it("Windows のサーバでは二重引用符で包む", async () => {
    const s = setup({ os: "windows" });
    (s.conn.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) =>
      method === "file.upload.commit" ? { path: "C:\\Users\\me\\state\\dropped-files\\d1\\my file.txt" } : { uploadId: "u1" },
    );
    s.transfer.drop("p1", payload({ files: [dropped("my file.txt", "ab")] }));
    await idle();
    expect(s.sent).toEqual([["p1", '"C:\\Users\\me\\state\\dropped-files\\d1\\my file.txt" ']]);
  });

  it("空のファイルは片を送らずに置く。フォルダは送れないと知らせて飛ばす", async () => {
    const s = setup();
    s.transfer.drop("p1", payload({ files: [dropped("dir", "", true), dropped("empty.txt", "")] }));
    await idle();
    expect(methods(s.requests)).toEqual(["file.upload.begin", "file.upload.commit"]);
    expect(s.toasts).toEqual(["フォルダは送れません（ブラウザが中身を渡さないため）"]);
    expect(s.sent).toEqual([["p1", "/state/dropped-files/d1/empty.txt "]]);
  });

  it("大きすぎるファイルは送らない。失敗したら知らせ、溜めたキーは失わない", async () => {
    const big = setup();
    const huge = Object.defineProperty(new File([], "huge.iso"), "size", { value: FILE_MAX_BYTES + 1 });
    big.transfer.drop("p1", payload({ files: [{ file: huge, directory: false }] }));
    await idle();
    expect(big.requests).toEqual([]);
    expect(big.toasts).toEqual(["ファイルが大きすぎます（256MB まで）: huge.iso"]);

    const s = setup({ failOn: { method: "file.upload.chunk", code: "file_store_failed" } });
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "ab")] }));
    s.gate.sendInput("p1", "k");
    await idle();
    expect(methods(s.requests)).toEqual(["file.upload.begin", "file.upload.chunk", "file.upload.cancel"]);
    expect(s.toasts).toEqual(["サーバにファイルを保存できませんでした。サーバのログを確かめてください"]);
    expect(s.sent).toEqual([["p1", "k"]]);
  });

  it("途中で失敗しても、送り終えた分のパスは貼る", async () => {
    const s = setup({ failOn: { method: "file.upload.begin", code: "file_upload_busy", after: 1 } });
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "a"), dropped("b.txt", "b")] }));
    await idle();
    expect(s.sent).toEqual([["p1", "/state/dropped-files/d1/a.txt "]]);
    expect(s.toasts).toHaveLength(1);
  });

  it("サーバが返したパスに制御文字があれば貼らない", async () => {
    const s = setup();
    (s.conn.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) =>
      method === "file.upload.commit" ? { path: "/x/a\x1b[201~rm -rf" } : { uploadId: "u1" },
    );
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "ab")] }));
    await idle();
    expect(s.sent).toEqual([]);
    expect(s.toasts).toEqual(["サーバから返ったパスに使えない文字が含まれるため、貼り付けませんでした"]);
  });

  it("文字のドロップはそのまま貼る（ESC は落とす）", async () => {
    const s = setup({ bracketed: true });
    s.transfer.drop("p1", payload({ text: "echo hi\x1b[201~" }));
    await idle();
    expect(s.requests).toEqual([]);
    expect(s.sent).toEqual([["p1", "\x1b[200~echo hi[201~\x1b[201~"]]);
  });

  it("マシンを切り替えたら、始めていた送信を捨て、次のマシンの同じ id の pane へ何も届けない", async () => {
    const s = setup();
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "ab")] }));
    s.gate.sendInput("p1", "k");
    s.transfer.resetForMachineSwitch();
    await idle();
    expect(s.sent).toEqual([]);
  });

  it("pane が閉じていたら貼らない", async () => {
    const s = setup({ paneExists: false });
    s.transfer.drop("p1", payload({ files: [dropped("a.txt", "ab")] }));
    await idle();
    expect(s.sent).toEqual([]);
  });
});

describe("readDropPayload / acceptsDrop", () => {
  function dataTransfer(o: { files?: { file: File; directory?: boolean }[]; data?: Record<string, string> }): DataTransfer {
    const files = o.files ?? [];
    const data = o.data ?? {};
    return {
      types: [...(files.length > 0 ? ["Files"] : []), ...Object.keys(data)],
      files: files.map((f) => f.file),
      items: files.map((f) => ({ kind: "file", getAsFile: () => f.file, webkitGetAsEntry: () => ({ isDirectory: f.directory === true }) })),
      getData: (type: string) => data[type] ?? "",
    } as unknown as DataTransfer;
  }

  it("ファイル・フォルダ・file: の URI を読み取る（URI のコメント・file: 以外の行は捨てる）", () => {
    const a = new File(["a"], "a.txt");
    const d = new File([""], "dir");
    const p = readDropPayload(
      dataTransfer({ files: [{ file: a }, { file: d, directory: true }], data: { "text/uri-list": "# c\r\nfile:///home/me/a.txt\r\nhttps://x/\r\nfile:///home/me/dir\r\n", "text/plain": "ignored" } }),
    );
    expect(p.files).toEqual([
      { file: a, directory: false },
      { file: d, directory: true },
    ]);
    expect(p.uris).toEqual(["file:///home/me/a.txt", "file:///home/me/dir"]);
    expect(p.text).toBe("");
  });

  it("Firefox の text/x-moz-url（URI と題名が交互）からも URI を読む。文字だけのドロップは文字を読む", () => {
    expect(readDropPayload(dataTransfer({ data: { "text/x-moz-url": "file:///home/me/a.txt\na.txt" } })).uris).toEqual(["file:///home/me/a.txt"]);
    expect(readDropPayload(dataTransfer({ data: { "text/plain": "hello" } }))).toEqual({ files: [], uris: [], text: "hello" });
  });

  it("ファイル・URI・文字のドラッグだけを受ける", () => {
    expect(acceptsDrop(dataTransfer({ files: [{ file: new File(["a"], "a") }] }))).toBe(true);
    expect(acceptsDrop(dataTransfer({ data: { "text/plain": "x" } }))).toBe(true);
    expect(acceptsDrop(dataTransfer({ data: { "application/x-custom": "x" } }))).toBe(false);
    expect(acceptsDrop(null)).toBe(false);
  });
});
