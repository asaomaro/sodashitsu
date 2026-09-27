import { statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  CatalogError,
  loadCatalog,
  machinesFilePath,
  MAX_CATALOG_BYTES,
  MAX_MACHINES,
  newMachineId,
  resolveSelector,
  saveCatalog,
  validateCatalog,
  type MachineCatalogData,
} from "./MachineCatalog.js";
import { labelProblem, targetProblem, type MachineProfile } from "./machineRules.js";

const ID_A = "0123456789abcdef0123456789abcdef";
const ID_B = "fedcba9876543210fedcba9876543210";
const m = (over: Partial<MachineProfile> = {}): MachineProfile => ({
  id: ID_A,
  label: "Build",
  target: "you@build",
  enabled: true,
  ...over,
});

describe("machineRules（T5）", () => {
  it("宛先: 普通の形と ssh:// と IPv6 は通し、- 始まり・空白・制御文字・シェルの記号・パスワード・長すぎは断る", () => {
    for (const ok of [
      "build",
      "you@build.example.com",
      "ssh://you@server:2222",
      "ssh://[::1]:22",
      "you@10.0.0.2",
      "host_1.local",
    ])
      expect(targetProblem(ok)).toBeUndefined();
    expect(targetProblem("")).toMatch(/空/);
    expect(targetProblem("-oProxyCommand=evil")).toMatch(/- で始/);
    expect(targetProblem("you@build extra")).toMatch(/使えない文字/);
    expect(targetProblem("a\nb")).toMatch(/使えない文字/);
    for (const bad of ["a;b", "a$(x)", "a`x`", "a'b", 'a"b', "a|b", "a&b", "a\\b"])
      expect(targetProblem(bad)).toMatch(/使えない文字/);
    expect(targetProblem("you:secret@build")).toMatch(/パスワード/);
    expect(targetProblem("ssh://you:secret@build:22")).toMatch(/パスワード/);
    expect(targetProblem("x".repeat(1025))).toMatch(/バイト/);
    expect(targetProblem("x".repeat(1024))).toBeUndefined();
    // 利用者の部分の %xx（ssh:// では OpenSSH が戻す）・利用者名/ホスト名の先頭の - ・ホスト名なし
    expect(targetProblem("ssh://you%3Asecret@build")).toMatch(/%/);
    expect(targetProblem("you%3Asecret@build")).toMatch(/%/);
    expect(targetProblem("ssh://-oProxyCommand=x@h")).toMatch(/- で始/);
    expect(targetProblem("ssh://-oProxyCommand=x")).toMatch(/- で始/);
    expect(targetProblem("u@-oProxyCommand=x")).toMatch(/- で始/);
    expect(targetProblem("you@")).toMatch(/ホスト名/);
    expect(targetProblem("ssh://:22")).toMatch(/ホスト名/);
  });

  it("名前: 空・前後の空白・制御文字・local（大小問わず）・ほかの id・重複・長すぎは断る。自分自身との比較は除く", () => {
    const others = [m({ id: ID_B, label: "GPU" })];
    expect(labelProblem("Build", others)).toBeUndefined();
    expect(labelProblem("", others)).toMatch(/空/);
    expect(labelProblem(" Build", others)).toMatch(/空白/);
    expect(labelProblem("a\u0007b", others)).toMatch(/制御文字/);
    expect(labelProblem("LOCAL", others)).toMatch(/予約/);
    expect(labelProblem(ID_B, others)).toMatch(/id/);
    expect(labelProblem("GPU", others)).toMatch(/既に使われて/);
    expect(labelProblem("gpu", others)).toBeUndefined(); // 大文字小文字を区別する
    expect(labelProblem("GPU", others, ID_B)).toBeUndefined();
    expect(labelProblem("あ".repeat(43), others)).toMatch(/バイト/); // 129 バイト
    expect(labelProblem("x".repeat(128), others)).toBeUndefined(); // ちょうど 128 バイト
    for (const c of ["\u202e", "\u2028", "\u2029", "\u2066", "\u200f"])
      expect(labelProblem(`a${c}b`, others)).toMatch(/制御文字/);
  });
});

describe("MachineCatalog（T5）", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  const tmp = async (): Promise<string> => {
    const d = await makeTempDir("soda-machines-");
    dirs.push(d);
    return d;
  };

  it("id は 32 桁の 16 進で毎回違う", () => {
    const a = newMachineId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newMachineId()).not.toBe(a);
  });

  it("保存は 0600 で、読み直すと同じ（session は省略できる）", async () => {
    const root = await tmp();
    const data: MachineCatalogData = {
      version: 1,
      machines: [
        m(),
        m({ id: ID_B, label: "GPU", target: "ssh://gpu:2222", session: "agents", enabled: false }),
      ],
    };
    await saveCatalog(root, data);
    expect(statSync(machinesFilePath(root)).mode & 0o777).toBe(0o600);
    expect(await loadCatalog(root)).toEqual({ kind: "ok", data });
  });

  it("無ければ missing、壊れていれば invalid（投げない）", async () => {
    const root = await tmp();
    expect(await loadCatalog(root)).toEqual({ kind: "missing" });
    await writeFile(machinesFilePath(root), "{");
    expect(await loadCatalog(root)).toMatchObject({
      kind: "invalid",
      reason: expect.stringMatching(/JSON/),
    });
    await writeFile(machinesFilePath(root), " ".repeat(MAX_CATALOG_BYTES + 1));
    expect(await loadCatalog(root)).toMatchObject({
      kind: "invalid",
      reason: expect.stringMatching(/exceeds/),
    });
    // ちょうど上限の大きさ（空白で詰めた正しい中身）は読める
    const body = JSON.stringify({ version: 1, machines: [] });
    await writeFile(machinesFilePath(root), body + " ".repeat(MAX_CATALOG_BYTES - body.length));
    expect(await loadCatalog(root)).toEqual({ kind: "ok", data: { version: 1, machines: [] } });
    await rm(machinesFilePath(root));
    await mkdir(machinesFilePath(root));
    expect(await loadCatalog(root)).toMatchObject({ kind: "invalid" });
  });

  it("知らない項目（秘密の書き足し）・規則違反・上限・重複した id を拒む", () => {
    const base = { version: 1, machines: [m()] };
    expect(validateCatalog(base)).toEqual(base);
    const bad = (raw: unknown, re: RegExp) => expect(() => validateCatalog(raw)).toThrow(re);
    bad({ ...base, extra: 1 }, /unknown field: extra/);
    bad({ version: 1, machines: [{ ...m(), password: "x" }] }, /unknown field: password/);
    bad({ version: 2, machines: [] }, /version/);
    bad({ version: 1, machines: [m({ id: "xyz" })] }, /invalid id/);
    bad({ version: 1, machines: [m(), m({ label: "Other" })] }, /duplicate id/);
    bad({ version: 1, machines: [m({ target: "-oProxyCommand=x" })] }, /invalid target/);
    bad({ version: 1, machines: [m({ target: "u:p@h" })] }, /invalid target/);
    bad({ version: 1, machines: [m({ session: "../x" })] }, /invalid session/);
    bad({ version: 1, machines: [m(), m({ id: ID_B })] }, /invalid label/); // 同じ名前
    bad({ version: 1, machines: [m({ label: "local" })] }, /invalid label/);
    bad({ version: 1, machines: [{ ...m(), enabled: "yes" }] }, /enabled/);
    const many = Array.from({ length: MAX_MACHINES + 1 }, (_, i) =>
      m({ id: i.toString(16).padStart(32, "0"), label: `m${i}` }),
    );
    bad({ version: 1, machines: many }, /more than/);
    expect(
      validateCatalog({ version: 1, machines: many.slice(0, MAX_MACHINES) }).machines,
    ).toHaveLength(MAX_MACHINES); // ちょうど 64 台
    bad(JSON.parse('{"version":1,"machines":[],"__proto__":{"x":1}}'), /unknown field: __proto__/);
    expect(() => validateCatalog([])).toThrow(CatalogError);
  });

  it("保存も検証する（不正な値は書かない）", async () => {
    const root = await tmp();
    await expect(
      saveCatalog(root, { version: 1, machines: [m({ target: "-x" })] }),
    ).rejects.toThrow(CatalogError);
    expect(await loadCatalog(root)).toEqual({ kind: "missing" });
  });

  it("セレクタ: 有効なものだけ、id を優先し、次に名前の完全一致", () => {
    const list = [
      m(),
      m({ id: ID_B, label: ID_A.slice(0, 5), enabled: true }),
      m({ id: "1".repeat(32), label: "Off", enabled: false }),
    ];
    expect(resolveSelector(list, ID_A)).toEqual({ kind: "ok", machine: list[0] });
    expect(resolveSelector(list, "Build")).toEqual({ kind: "ok", machine: list[0] });
    expect(resolveSelector(list, "build")).toEqual({ kind: "unknown" });
    expect(resolveSelector(list, "Off")).toEqual({ kind: "unknown" });
    expect(resolveSelector(list, "1".repeat(32))).toEqual({ kind: "unknown" });
    expect(resolveSelector([m(), m({ id: ID_B })], "Build")).toEqual({ kind: "ambiguous" });
  });

  it("書き込みの一時ファイルを残さない", async () => {
    const root = await tmp();
    await saveCatalog(root, { version: 1, machines: [m()] });
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(root).filter((f) => f !== "machines.json" && !f.endsWith(".lock"))).toEqual(
      [],
    );
    void join;
  });
});
