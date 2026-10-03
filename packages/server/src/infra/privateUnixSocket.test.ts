import { connect, createServer, type Server } from "node:net";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { listenPrivateUnixSocket } from "./privateUnixSocket.js";

/** 繋いで、受け口が書いた 1 行を読む（受け口が生きていることの確認）。 */
function readGreeting(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = connect(path);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => (buf += chunk));
    sock.on("close", () => resolve(buf));
    sock.on("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Unix ドメイン socket のファイルの権限と rename の話なので、Windows では走らせない（Windows では受け口を置かない）。
describe.skipIf(process.platform === "win32")("listenPrivateUnixSocket", () => {
  let dir: string;
  let path: string;
  let server: Server;

  beforeEach(async () => {
    dir = await makeTempDir("soda-private-sock-");
    path = join(dir, "pane.sock");
    server = createServer((sock) => sock.end("hello\n"));
  });

  afterEach(async () => {
    await closeServer(server);
    await rm(dir, { recursive: true, force: true });
  });

  it("socket を 0600 で置き、そのパスで繋がる", async () => {
    await listenPrivateUnixSocket(server, path);

    const st = await stat(path);
    expect(st.isSocket()).toBe(true);
    expect(st.mode & 0o777).toBe(0o600);
    expect(await readGreeting(path)).toBe("hello\n");
  });

  it("成功したら一時ディレクトリを残さない", async () => {
    await listenPrivateUnixSocket(server, path, { tmpPrefix: ".p-" });

    expect(await readdir(dir)).toEqual(["pane.sock"]);
  });

  it("残骸のファイル（socket でない普通のファイル）を置き換える", async () => {
    await writeFile(path, "stale"); // 前回の不正終了の残骸を模す

    await listenPrivateUnixSocket(server, path);

    expect((await stat(path)).isSocket()).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readGreeting(path)).toBe("hello\n");
  });

  it("前の受け口の socket が残っていても置き換え、新しい受け口へ繋がる", async () => {
    const old = createServer((sock) => sock.end("old\n"));
    await listenPrivateUnixSocket(old, path);
    try {
      await listenPrivateUnixSocket(server, path);

      expect(await readGreeting(path)).toBe("hello\n");
    } finally {
      await closeServer(old);
    }
  });

  it("失敗したら投げ、一時ディレクトリを残さず、待ち受けも閉じる", async () => {
    // rename の先が空でないディレクトリ → rename が失敗する（listen と chmod は済んだ後の失敗）。
    await mkdir(path);
    await writeFile(join(path, "keep"), "x");

    await expect(listenPrivateUnixSocket(server, path, { tmpPrefix: ".p-" })).rejects.toThrow();

    expect(await readdir(dir)).toEqual(["pane.sock"]); // `.p-XXXXXX` が残っていない
    expect(await readdir(path)).toEqual(["keep"]); // 置き場には触れていない
    expect(server.listening).toBe(false);
  });

  it("置き場のディレクトリが無ければ投げる（何も作らない）", async () => {
    await expect(listenPrivateUnixSocket(server, join(dir, "missing", "pane.sock"))).rejects.toThrow();

    expect(await readdir(dir)).toEqual([]);
    expect(server.listening).toBe(false);
  });
});
