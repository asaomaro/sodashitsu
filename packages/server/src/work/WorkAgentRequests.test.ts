import { mkdtemp, mkdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { WorkAgentRequests } from "./WorkAgentRequests.js";
import { WorkContext } from "./WorkContext.js";

it("freezes the source pane project; claims once and rejects changed identity or expired requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-work-agent-"));
  try {
    let now = Date.now(), folder = join(dir, "project"); const paneId = randomUUID(), workspaceId = randomUUID();
    await mkdir(folder); await mkdir(join(dir, "state")); await mkdir(join(dir, "home"));
    const work = new WorkContext(join(dir, "state"), () => undefined, () => folder, { home: join(dir, "home"), env: {} });
    const requests = new WorkAgentRequests(work, id => id === paneId ? { workspaceId } : undefined, () => folder, () => now);
    const r = await requests.create({ paneId, agentKind: "codex", args: ["resume", "--last"] });
    expect(r.folder).toBe(folder); expect(r.workspaceId).toBe(workspaceId);
    const results = await Promise.allSettled([requests.claim(r.id), requests.claim(r.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const accepted = results.find(r => r.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof requests.claim>>>;
    expect(() => requests.finish(r.id, randomUUID(), "launched")).toThrow();
    requests.finish(r.id, accepted.value.claim, "launched");
    const changed = await requests.create({ paneId, agentKind: "claude", args: [] });
    await rename(folder, folder + "-old"); await mkdir(folder);
    await expect(requests.claim(changed.id)).rejects.toThrow(/実体/);
    now += 600001;
    expect(requests.list().requests).toEqual([]);
    await expect(requests.claim(changed.id)).rejects.toThrow(/期限/);
    await expect(requests.create({ paneId, agentKind: "claude", args: ["mcp", "add", "x"] })).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
