import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { WorkspaceTools } from "./WorkspaceTools.js";
import { WorkspaceToolsParams } from "@sodashitsu/protocol";
const id = "12345678-1234-4123-8123-123456789012";
let base: string, root: string, folder: string, tools: WorkspaceTools;
const run = (operation: string, extra: Record<string, unknown> = {}) =>
  tools.run(WorkspaceToolsParams.parse({ workspaceId: id, operation, ...extra }));
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "soda-tools-"));
  root = join(base, "pj");
  await mkdir(root);
  folder = root;
  tools = new WorkspaceTools(() => folder);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});
describe("workspace filesystem", () => {
  it("lists directories, searches filenames and content with line numbers, and writes with a version", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "日本語.txt"), "one\nneedle 日本語\n");
    expect((await run("list")).entries?.[0]?.directory).toBe(true);
    expect((await run("search", { query: "日本語" })).matches?.[0]?.path).toBe("src/日本語.txt");
    expect((await run("search", { query: "NEEDLE", grep: true })).matches).toEqual([
      { path: "src/日本語.txt", line: 2, text: "needle 日本語" },
    ]);
    const before = await run("read", { path: "src/日本語.txt" });
    await run("write", { path: "src/日本語.txt", content: "new\n", version: before.version });
    expect(await readFile(join(root, "src", "日本語.txt"), "utf8")).toBe("new\n");
  });
  it("refuses outside paths, symlinks, hardlinks and Git metadata aliases", async () => {
    await writeFile(join(base, "outside"), "secret");
    await symlink(join(base, "outside"), join(root, "outside-link"));
    await link(join(base, "outside"), join(root, "outside-hardlink"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "secret");
    await symlink(join(root, ".git"), join(root, "alias"));
    for (const path of [
      "../outside",
      "outside-link",
      "outside-hardlink",
      "alias/config",
      ".git/config",
    ])
      await expect(run("read", { path })).rejects.toThrow();
  });
  it("rejects stale edits and serializes concurrent saves", async () => {
    await writeFile(join(root, "file"), "original");
    const r = await run("read", { path: "file" });
    await writeFile(join(root, "file"), "external");
    await expect(
      run("write", { path: "file", version: r.version, content: "lost" }),
    ).rejects.toThrow("変更");
    expect(await readFile(join(root, "file"), "utf8")).toBe("external");
    const current = await run("read", { path: "file" });
    const writes = await Promise.allSettled([
      run("write", { path: "file", version: current.version, content: "a" }),
      run("write", { path: "file", version: current.version, content: "b" }),
    ]);
    expect(writes.filter((w) => w.status === "fulfilled")).toHaveLength(1);
  });
  it("does not flatten UTF-8 BOM, rejects binary and prevents directory alias writes", async () => {
    await writeFile(join(root, "file"), "\ufeffhello");
    expect((await run("read", { path: "file" })).text).toBe("\ufeffhello");
    await writeFile(join(root, "bin"), Buffer.from([0, 1]));
    await expect(run("read", { path: "bin" })).rejects.toThrow();
    await mkdir(join(root, "dir"));
    await writeFile(join(root, "dir", "f"), "x");
    await symlink(join(root, "dir"), join(root, "link"));
    const r = await run("read", { path: "link/f" });
    await expect(
      run("write", { path: "link/f", version: r.version, content: "y" }),
    ).rejects.toThrow("実体");
  });
});
it("Git graph and staged/working/commit diffs stay within a subfolder PJ", async () => {
  const git = (args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init"]);
  await mkdir(join(root, "sub"));
  await writeFile(join(root, "sub", "inner.txt"), "inner\n");
  await writeFile(join(root, "outer.txt"), "outer\n");
  git(["add", "."]);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "first"]);
  const commit = git(["rev-parse", "HEAD"]).trim();
  folder = join(root, "sub");
  await writeFile(join(root, "sub", "inner.txt"), "inner changed\n");
  await writeFile(join(root, "outer.txt"), "secret outside\n");
  const status = await run("git-status");
  expect(status.files).toEqual([{ path: "inner.txt", status: " M" }]);
  expect((await run("git-log")).text).toContain(commit);
  await expect(run("git-diff", { path: ":(top)*" })).rejects.toThrow();
  const diff = await run("git-diff");
  expect(diff.text).toContain("+inner changed");
  expect(diff.text).not.toContain("secret outside");
  git(["add", "sub/inner.txt"]);
  expect((await run("git-diff", { staged: true })).text).toContain("+inner changed");
  const historic = (await run("git-diff", { commit })).text!;
  expect(historic).toContain("inner.txt");
  expect(historic).not.toContain("outer.txt");
});

it("keeps expectedFolder through RPC parsing and refuses a changed PJ", async () => {
  const params = WorkspaceToolsParams.parse({
    workspaceId: id,
    operation: "list",
    expectedFolder: root,
  });
  expect(params.expectedFolder).toBe(root);
  folder = base;
  await expect(tools.run(params)).rejects.toThrow("PJフォルダが変更");
});
