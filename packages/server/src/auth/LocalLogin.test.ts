import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  isSameMachine,
  LocalLogin,
  localAuthPath,
  normalizeAddress,
  parseLocalAuth,
  readLocalAuth,
} from "./LocalLogin.js";

// 20260927-cli-mode の T4：手元からのログインの秘密と「同じマシンから」の判定。
describe("normalizeAddress / isSameMachine", () => {
  it("IPv4-mapped IPv6 を IPv4 に揃え、ゾーンを落とし、小文字にする", () => {
    expect(normalizeAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeAddress("::FFFF:192.168.1.5")).toBe("192.168.1.5");
    expect(normalizeAddress("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeAddress("::1")).toBe("::1");
  });

  it("相手と受けたアドレスが同じなら同じマシン（片側だけ mapped でも）", () => {
    expect(isSameMachine("127.0.0.1", "127.0.0.1")).toBe(true);
    expect(isSameMachine("::ffff:127.0.0.1", "127.0.0.1")).toBe(true);
    expect(isSameMachine("::1", "::1")).toBe(true);
    expect(isSameMachine("192.168.1.10", "::ffff:192.168.1.10")).toBe(true);
  });

  it("ループバック同士（127.0.0.0/8・::1）は同じマシンとみなす（--host 127.0.0.2 に 127.0.0.1 から繋ぐ）", () => {
    expect(isSameMachine("127.0.0.1", "127.0.0.2")).toBe(true);
    expect(isSameMachine("::ffff:127.0.0.1", "127.1.2.3")).toBe(true);
    expect(isSameMachine("::1", "127.0.0.1")).toBe(true);
    expect(isSameMachine("192.168.1.5", "127.0.0.1")).toBe(false);
    expect(isSameMachine("127.0.0.1", "192.168.1.5")).toBe(false);
  });

  it("別のアドレス（LAN の別の機械・別の形）や分からないときは同じマシンとみなさない", () => {
    expect(isSameMachine("192.168.1.5", "192.168.1.10")).toBe(false);
    expect(isSameMachine("::ffff:192.168.1.5", "::ffff:192.168.1.10")).toBe(false);
    expect(isSameMachine("10.0.0.2", "127.0.0.1")).toBe(false);
    expect(isSameMachine(undefined, "127.0.0.1")).toBe(false);
    expect(isSameMachine("127.0.0.1", undefined)).toBe(false);
    expect(isSameMachine("", "")).toBe(false);
  });
});

describe("LocalLogin", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  async function tempDir(): Promise<string> {
    const d = await makeTempDir("soda-local-login-");
    dirs.push(d);
    return d;
  }

  it("start は秘密と pid を local-auth.json（0600）に書き、その秘密だけを受ける", async () => {
    const dir = await tempDir();
    const login = new LocalLogin(dir, 4242);
    expect(login.verify("anything")).toBe(false); // start の前
    await login.start();
    const rec = await readLocalAuth(dir);
    expect(rec?.pid).toBe(4242);
    expect(rec?.secret).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 バイトの base64url
    if (process.platform !== "win32")
      expect((await stat(localAuthPath(dir))).mode & 0o777).toBe(0o600);
    expect(login.verify(rec!.secret)).toBe(true);
    expect(login.verify(`${rec!.secret}x`)).toBe(false);
    expect(login.verify(rec!.secret.slice(1))).toBe(false);
    expect(
      login.verify(`${rec!.secret.slice(0, -1)}${rec!.secret.endsWith("A") ? "B" : "A"}`),
    ).toBe(false);
    expect(login.verify("")).toBe(false);
  });

  it("起動ごとに作り直す（前の起動の秘密は通らない）", async () => {
    const dir = await tempDir();
    const a = new LocalLogin(dir, 1);
    await a.start();
    const first = (await readLocalAuth(dir))!.secret;
    const b = new LocalLogin(dir, 2);
    await b.start();
    const second = (await readLocalAuth(dir))!.secret;
    expect(second).not.toBe(first);
    expect(b.verify(first)).toBe(false);
  });

  it("stop はファイルを消し、以後は何も受けない。書いていなければ触らない", async () => {
    const dir = await tempDir();
    const login = new LocalLogin(dir, 1);
    await login.start();
    const secret = (await readLocalAuth(dir))!.secret;
    await login.stop();
    expect(await readLocalAuth(dir)).toBeUndefined();
    expect(login.verify(secret)).toBe(false);
    // 書いていない実体の stop は、ほかのサーバが書いたファイルを消さない
    await writeFile(localAuthPath(dir), JSON.stringify({ secret: "s", pid: 9, createdAt: "" }));
    await new LocalLogin(dir, 1).stop();
    expect(JSON.parse(await readFile(join(dir, "local-auth.json"), "utf8")).pid).toBe(9);
  });

  it("parseLocalAuth は形が合わなければ undefined", () => {
    expect(parseLocalAuth("{")).toBeUndefined();
    expect(parseLocalAuth('{"secret":"","pid":1}')).toBeUndefined();
    expect(parseLocalAuth('{"secret":"s","pid":0}')).toBeUndefined();
    expect(parseLocalAuth('{"secret":"s","pid":1.5}')).toBeUndefined();
    expect(parseLocalAuth('{"secret":"s","pid":3}')).toEqual({
      secret: "s",
      pid: 3,
      createdAt: "",
    });
  });
});
