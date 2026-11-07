import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { NativeSubagentService } from "./NativeSubagentService.js";
import { NativeSubagentReader, type NativeSubagentSource } from "./NativeSubagentReader.js";
const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "soda-agy-children-")); dirs.push(home);
  const system = join(home, ".gemini/antigravity-cli/brain", parent, ".system_generated"), dir = join(system, "subagents");
  await mkdir(join(system, "logs"), { recursive: true }); await mkdir(dir);
  await writeFile(join(system, "logs/transcript.jsonl"), await readFile(new URL("./fixtures/agy-subagents/parent.jsonl", import.meta.url)));
  const alive = await readFile(new URL("./fixtures/agy-subagents/alive.json", import.meta.url), "utf8");
  const file = join(dir, child + ".json"); await writeFile(file, alive);
  const source: NativeSubagentSource = { paneId: "pane", instanceId: "instance", kind: "agy", sessionId: parent };
  const reader = new NativeSubagentReader({ home, codexHome: join(home, ".codex") });
  return { home, system, dir, file, alive, source, reader };
}
describe("Antigravity official direct-child snapshots", () => {
  it("counts ALIVE membership as unknown task state, including provider-listed idle; killed children disappear", async () => {
    const f = await fixture();
    const first = await f.reader.read(f.source);
    expect(first).toMatchObject({ count: 1, countBasis: "alive", items: [{ id: child, state: "unknown", description: "Integration Probe", type: "self", depth: 1 }] });
    expect(first?.items[0]?.hasTranscript).toBeUndefined();
    expect(await f.reader.read(f.source)).toEqual(first);
    await writeFile(f.file, await readFile(new URL("./fixtures/agy-subagents/killed.json", import.meta.url)));
    expect(await f.reader.read(f.source)).toEqual({ count: 0, countBasis: "alive", items: [] });
    await writeFile(f.file, f.alive.replace("SUBAGENT_STATE_ALIVE", "SUBAGENT_STATE_FUTURE"));
    expect(await f.reader.read(f.source)).toBeUndefined();
    f.reader.close(); expect(await f.reader.read(f.source)).toBeUndefined();
  });
  it("publishes actual official files through the verified service without losing API metadata", async () => {
    const f = await fixture();
    const pane = { id: "pane", agent: { kind: "agy", instanceId: "instance" }, agentSession: { kind: "agy", sessionId: parent } } as unknown as Pane;
    const service = new NativeSubagentService({ reader: f.reader, bus: { subscribe: () => ({ dispose() {} }) }, session: {
      snapshot: () => ({ panes: [pane] }), getPane: () => pane, hasVerifiedAgentSession: () => true,
      setAgentSubagents: (_id, value) => { pane.agent!.subagents = value; return true; },
    } });
    await service.refresh();
    expect(JSON.parse(JSON.stringify(pane)).agent.subagents).toMatchObject({ count: 1, countBasis: "alive", items: [{ state: "unknown", startedAt: Date.parse("2026-11-07T04:11:23Z") }] });
    await writeFile(f.file, await readFile(new URL("./fixtures/agy-subagents/killed.json", import.meta.url))); await service.refresh();
    expect(JSON.parse(JSON.stringify(pane)).agent.subagents).toEqual({ count: 0, countBasis: "alive", items: [] });
    service.close();
  });
  it.each(["child-id", "state", "spawn", "unproven-spawn", "truncated", "oversize"])("rejects invalid %s instead of inventing zero", async change => {
    const f = await fixture(); const row = JSON.parse(f.alive);
    if (change === "child-id") row.conversationId = parent;
    if (change === "state") delete row.state;
    if (change === "spawn") row.spawnStepIndex = -1;
    if (change === "unproven-spawn") row.spawnStepIndex = 999;
    await writeFile(f.file, change === "truncated" ? "{" : change === "oversize" ? " ".repeat(32769) : JSON.stringify(row));
    expect(await f.reader.read(f.source)).toBeUndefined(); f.reader.close();
  });
  it.each(["wrong-tool", "wrong-result-id", "duplicate-step", "partial-json", "oversize"])("requires bounded official parent proof: %s", async change => {
    const f = await fixture(), path = join(f.system, "logs/transcript.jsonl");
    let text = await readFile(path, "utf8");
    if (change === "wrong-tool") text = text.replace("invoke_subagent", "run_command");
    if (change === "wrong-result-id") text = text.replaceAll(child, "33333333-3333-4333-8333-333333333333");
    if (change === "duplicate-step") text += text.split("\n")[0] + "\n";
    if (change === "partial-json") text += "{";
    if (change === "oversize") text = " ".repeat(4 * 1024 * 1024 + 1);
    await writeFile(path, text); expect(await f.reader.read(f.source)).toBeUndefined(); f.reader.close();
  });
  it.each(["file-symlink", "hardlink", "directory-symlink", "parent-symlink", "unsafe-name"])("rejects %s", async change => {
    const f = await fixture();
    if (change === "file-symlink" || change === "hardlink") {
      const outside = join(f.home, "outside.json"); await writeFile(outside, f.alive); await rm(f.file);
      if (change === "hardlink") await link(outside, f.file); else await symlink(outside, f.file);
    } else if (change === "directory-symlink") {
      await rm(f.dir, { recursive: true }); const outside = join(f.home, "outside"); await mkdir(outside); await symlink(outside, f.dir);
    } else if (change === "parent-symlink") {
      await rm(join(f.system, "logs"), { recursive: true }); const outside = join(f.home, "outside"); await mkdir(outside); await writeFile(join(outside, "transcript.jsonl"), ""); await symlink(outside, join(f.system, "logs"));
    } else await writeFile(join(f.dir, "not-a-child.json"), f.alive);
    expect(await f.reader.read(f.source)).toBeUndefined(); f.reader.close();
  });
  it("keeps missing directory/session unknown, rejects traversal, bounds directory scan and item publication", async () => {
    const f = await fixture();
    expect(await f.reader.read({ ...f.source, sessionId: "../../outside" })).toBeUndefined();
    expect(await f.reader.read({ ...f.source, sessionId: "33333333-3333-4333-8333-333333333333" })).toBeUndefined();
    const row = JSON.parse(f.alive);
    for (let n = 0; n < 64; n++) {
      const id = n.toString(16).padStart(8, "0") + "-3333-4333-8333-333333333333";
      const step = 100 + n * 2;
      const original = (await readFile(new URL("./fixtures/agy-subagents/parent.jsonl", import.meta.url), "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l));
      const call = { ...original.find(r => r.step_index === 1), step_index: step - 1 };
      const result = { ...original.find(r => r.step_index === 2), step_index: step };
      result.content = result.content.replaceAll(child, id);
      await appendFile(join(f.system, "logs/transcript.jsonl"), JSON.stringify(call) + "\n" + JSON.stringify(result) + "\n");
      await writeFile(join(f.dir, id + ".json"), JSON.stringify({ ...row, conversationId: id, spawnStepIndex: step }));
    }
    const value = await f.reader.read(f.source); expect(value?.count).toBe(65); expect(value?.items).toHaveLength(64);
    for (let n = 0; n < 200; n++) await writeFile(join(f.dir, n + ".ignored"), "");
    expect(await f.reader.read(f.source)).toBeUndefined();
    await rm(f.dir, { recursive: true }); expect(await f.reader.read(f.source)).toBeUndefined(); f.reader.close();
  });
  it("invalidates pending reads on forget, close, session and kind replacement", async () => {
    for (const change of ["forget", "close", "session", "kind"]) {
      const f = await fixture(), pending = f.reader.read(f.source);
      if (change === "forget") f.reader.forget(f.source.paneId);
      if (change === "close") f.reader.close();
      if (change === "session") await f.reader.read({ ...f.source, sessionId: "33333333-3333-4333-8333-333333333333" });
      if (change === "kind") await f.reader.read({ ...f.source, kind: "codex" });
      expect(await pending).toBeUndefined(); f.reader.close();
    }
  });
});
