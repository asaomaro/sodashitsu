import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_START_KINDS } from "@sodashitsu/protocol";
import { createAgentKindsLister } from "./agentKinds.js";

// 20261008-graph-first の PR3 T14b：起動できる種類の一覧。
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function binDir(files: Record<string, number>): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "soda-kinds-"));
  dirs.push(d);
  for (const [name, mode] of Object.entries(files)) {
    await writeFile(join(d, name), "#!/bin/sh\n");
    await chmod(join(d, name), mode);
  }
  return d;
}

describe("agent.kinds の一覧", () => {
  it("表の種類をすべて返し、PATH に実行できる実行ファイルがあるものだけ available。実行ファイルの名前（cursor-agent など）は結果に出ない", async () => {
    const d = await binDir({ claude: 0o755, "cursor-agent": 0o755, codex: 0o644 }); // codex は実行できない
    const list = createAgentKindsLister({ env: { PATH: d }, platform: "linux" });
    const r = await list();
    expect(r.kinds.map((k) => k.kind)).toEqual([...AGENT_START_KINDS]);
    const avail = r.kinds.filter((k) => k.available).map((k) => k.kind).sort();
    expect(avail).toEqual(["claude", "cursor"]);
    expect(r.kinds.find((k) => k.kind === "claude")!.label).toBe("Claude Code");
    expect(JSON.stringify(r)).not.toContain("cursor-agent");
    expect(Object.keys(r.kinds[0]!).sort()).toEqual(["available", "kind", "label"]);
  });

  it("PATH が空・Windows なら、すべて available でない。5 秒は覚える", async () => {
    const d = await binDir({ claude: 0o755 });
    expect((await createAgentKindsLister({ env: { PATH: "" }, platform: "linux" })()).kinds.some((k) => k.available)).toBe(false);
    expect((await createAgentKindsLister({ env: { PATH: d }, platform: "win32" })()).kinds.some((k) => k.available)).toBe(false);
    let t = 1000;
    const env = { PATH: d };
    const list = createAgentKindsLister({ env, platform: "linux", now: () => t });
    expect((await list()).kinds.find((k) => k.kind === "claude")!.available).toBe(true);
    await rm(join(d, "claude"));
    expect((await list()).kinds.find((k) => k.kind === "claude")!.available).toBe(true); // 覚えている
    t += 6000;
    expect((await list()).kinds.find((k) => k.kind === "claude")!.available).toBe(false);
  });
});
