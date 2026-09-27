import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { WriteStream } from "node:tty";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import {
  HANDOFF_FILE_NAME,
  HANDOFF_FORMAT_VERSION,
  HANDOFF_NONCE_ENV,
  isPtyMaster,
  writeHandoffManifest,
} from "./handoff/HandoffManifest.js";
import { nodePtyNative } from "./pty/nodePtyNative.js";

/**
 * 新しい版の起動での引き継ぎの受け取り（20260926-live-handoff の T7）を、`composeServer.listen` の配線ごと確かめる。execve はせず、
 * 同じプロセスの中で PTY の組を作って「渡された master」に見立て、`handoff.json` と環境変数を用意してから起動する。
 * execve をまたぐ通しは smoke（`handoffSmoke.ts`）。
 */
vi.setConfig({ testTimeout: 20_000 });

const NONCE = "0123456789abcdef0123456789abcdef";

describe.skipIf(process.platform !== "linux")("composeServer: 引き継ぎの起動（T7）", () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    delete process.env[HANDOFF_NONCE_ENV];
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /** 普通に起動して止め、pane を 1 つ持つ session.json を作る。 */
  async function prepared(): Promise<{ stateDir: string; paneId: string }> {
    const stateDir = await makeTempDir("wtm-handoff-compose-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const paneId = first.session.snapshot().panes[0]!.id;
    await first.close();
    return { stateDir, paneId };
  }

  /** 渡された PTY に見立てる組（master・slave）と、pane のプロセスに見立てる子。 */
  function fakeHandedOffPty(): { master: number; slave: number; child: ChildProcess } {
    const { master, slave } = nodePtyNative().open(80, 24);
    const child = spawn("sleep", ["60"], { stdio: "ignore" });
    cleanups.push(() => {
      child.kill("SIGKILL");
    });
    return { master, slave, child };
  }

  async function start(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      { attempts: 1 },
    );
    cleanups.push(() => server.close());
    return server;
  }

  it("渡された PTY を pane の端末にし、前の画面を見せ、入出力が通る。環境変数と handoff.json は消える", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, slave, child } = fakeHandedOffPty();
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef01",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [
        { paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "OLD-SCREEN-LINE\r\n" },
      ],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toEqual({ id: "abcdef01", adopted: 1, dropped: 0 });
    expect(process.env[HANDOFF_NONCE_ENV]).toBeUndefined();
    expect(existsSync(join(stateDir, HANDOFF_FILE_NAME))).toBe(false);
    const host = server.terminals.get(paneId)!;
    expect(host.pid).toBe(child.pid);
    expect(host.mirror.plainText()).toContain("OLD-SCREEN-LINE");
    const out = new WriteStream(slave);
    cleanups.push(() => {
      out.destroy();
    });
    out.write("from-the-shell\r\n");
    const deadline = Date.now() + 5000;
    while (!host.mirror.plainText().includes("from-the-shell") && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    expect(host.mirror.plainText()).toContain("from-the-shell");
  });

  it("受け渡しに載らなかった PTY の master（読み取りを止めた後にできた pane 等）は、PTY を開く前に閉じる。受け渡しの master は閉じない", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, child } = fakeHandedOffPty();
    const stray = nodePtyNative().open(80, 24);
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef04",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toMatchObject({ adopted: 1, dropped: 0 });
    expect(isPtyMaster(stray.master)).toBe(false); // 閉じた
    expect(isPtyMaster(master)).toBe(true); // 引き継いだ pane の master は開いたまま
    expect(server.terminals.get(paneId)?.pid).toBe(child.pid);
  });

  it("確かめに通らなかった（書いた pid が違う）PTY は、新しいシェルを開く前に手放す——新しいシェルの master を閉じない", async () => {
    const { stateDir, paneId } = await prepared();
    const { master, child } = fakeHandedOffPty();
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef02",
      nonce: NONCE,
      pid: process.pid + 1,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: master, pid: child.pid!, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toEqual({ id: "abcdef02", adopted: 0, dropped: 1 });
    const host = server.terminals.get(paneId)!;
    expect(host.pid).not.toBe(child.pid);
    // 新しいシェルは生きていて、その master は開いたまま（同じ番号を再利用していても閉じられていない）
    await new Promise((r) => setTimeout(r, 300));
    expect(server.terminals.get(paneId)).toBe(host);
    const fd = (host as unknown as { pty: { handoffFd(): number | undefined } }).pty.handoffFd();
    expect(fd !== undefined && isPtyMaster(fd)).toBe(true);
    expect(child.exitCode).toBeNull(); // 確かめに通らなかった pid にはシグナルを送らない
  });

  it("確かめに通らなかった番号を新しいシェルの master が使っていても、閉じない（手放すのは PTY を開く前）", async () => {
    // 1 回目の起動で pane の master が使った番号を控える（同じ手順の起動は同じ番号を使うことが多い）。
    const stateDir = await makeTempDir("wtm-handoff-compose-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const first = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    const paneId = first.session.snapshot().panes[0]!.id;
    const usedFd = (
      first.terminals.get(paneId) as unknown as { pty: { handoffFd(): number | undefined } }
    ).pty.handoffFd()!;
    await first.close();
    // シェルが終わって node-pty が master を閉じるのを待つ（いまは開いていない番号にする）
    const deadline = Date.now() + 5000;
    while (isPtyMaster(usedFd) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    expect(isPtyMaster(usedFd)).toBe(false);
    // その番号を「渡された」ことにする——開いていないので確かめに通らない（rejected）。
    await writeHandoffManifest(stateDir, {
      format: HANDOFF_FORMAT_VERSION,
      id: "abcdef03",
      nonce: NONCE,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      port: 1,
      panes: [{ paneId, fd: usedFd, pid: 999999999, cols: 80, rows: 24, screen: "" }],
      scrollbackEditors: [],
    });
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toMatchObject({ adopted: 0, dropped: 1 });
    const host = server.terminals.get(paneId)!;
    await new Promise((r) => setTimeout(r, 500));
    expect(server.terminals.get(paneId)).toBe(host); // 新しいシェルは閉じられていない
    const fd = (host as unknown as { pty: { handoffFd(): number | undefined } }).pty.handoffFd();
    expect(fd !== undefined && isPtyMaster(fd)).toBe(true);
  });

  it("環境変数はあるが受け渡しが無い（壊れた）なら、残った PTY の master を閉じて普通に起動する", async () => {
    const { stateDir, paneId } = await prepared();
    const { master } = fakeHandedOffPty();
    process.env[HANDOFF_NONCE_ENV] = NONCE;
    const server = await start(stateDir);
    expect(server.handoffResult).toBeUndefined();
    expect(server.terminals.get(paneId)).toBeDefined(); // 普通の復元
    const log = await readFile(join(stateDir, "server.log"), "utf8").catch(() => "");
    await (server.logger as unknown as { flush(): Promise<void> }).flush();
    const log2 = log + (await readFile(join(stateDir, "server.log"), "utf8"));
    expect(log2).toMatch(/handoff data was unusable.*"closed":[1-9]/);
    void master;
  });
});
