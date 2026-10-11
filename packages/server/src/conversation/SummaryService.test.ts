import { afterEach, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { join, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { SummaryService } from "./SummaryService.js";
import type { ConversationService } from "./ConversationService.js";
const dirs: string[] = [],
  services: SummaryService[] = [];
afterEach(async () => {
  services.splice(0).forEach((s) => s.close());
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const issued = "11111111-1111-4111-8111-111111111111";
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "soda-summary-test-"));
  dirs.push(dir);
  const bin = join(dir, "bin"),
    home = join(dir, "original");
  await mkdir(bin);
  await mkdir(home);
  await writeFile(join(home, "auth.json"), '{"test":"credential"}');
  await writeFile(
    join(home, "config.toml"),
    'model="custom"\n[mcp_servers.remote]\ncommand="dangerous"\n',
  );
  const log = join(dir, "launch.json");
  await writeFile(
    join(bin, "codex"),
    `#!${process.execPath}\nimport {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';const args=process.argv.slice(2);writeFileSync(${JSON.stringify(log)},JSON.stringify({args,home:process.env.CODEX_HOME,config:readFileSync(join(process.env.CODEX_HOME,'config.toml'),'utf8')}));let input="";process.stdin.on("data",c=>input+=c);process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(join(dir, "prompt.txt"))},input);setTimeout(()=>{writeFileSync(args[args.indexOf('--output-last-message')+1],'目的: 作業を整理する');console.log(JSON.stringify({type:'thread.started',thread_id:'${issued}'}));},150)});`,
  );
  await chmod(join(bin, "codex"), 0o755);
  vi.stubEnv("PATH", bin + delimiter + process.env.PATH);
  vi.stubEnv("CODEX_HOME", home);
  let sourceId = "source",
    size = 100,
    identity = "initial",
    text = "作業を整理して";
  const read = vi.fn(async (_kind, _id, offset = 0) => ({
    messages: offset < size ? [{ role: "user", text }] : [],
    nextOffset: null,
    endOffset: size,
    partial: false,
  }));
  const conversations = {
    isActive: () => false,
    source: () => ({ kind: "codex", sessionId: sourceId }),
    revision: async (_kind: string, _id: string, checkpoint?: number) => ({
      size,
      identity: `${identity}:${checkpoint ?? size}`,
    }),
    read,
  } as unknown as ConversationService;
  const service = new SummaryService(conversations, join(dir, "state"));
  services.push(service);
  return {
    service,
    dir,
    log,
    home,
    conversations,
    read,
    append: () => {
      size += 100;
      text = "追加の依頼";
    },
    replace: () => {
      identity = "replaced";
      text = "新しい会話";
    },
    setSource: (id: string) => (sourceId = id),
  };
}
it.skipIf(process.platform === "win32")(
  "runs Codex with isolated auth/config and reuses only issued sessions",
  async () => {
    const f = await fixture();
    await expect(
      f.service.generate("p", { kind: "codex", model: "", sessionId: "other-work" }),
    ).rejects.toThrow(/専用/);
    const result = await f.service.generate("p", { kind: "codex", model: "m", sessionId: "" });
    expect(result.text).toContain("目的");
    expect(result.sessionId).toBe(issued);
    const launch = JSON.parse(await readFile(f.log, "utf8"));
    expect(launch.home).not.toBe(f.home);
    expect(launch.config).not.toContain("mcp_servers");
    expect(launch.config).toContain("read-only");
    expect(launch.config).toContain("disabled");
    expect(launch.args).toContain("m");
    const pending = f.service.generate("p", { kind: "codex", model: "", sessionId: issued });
    await expect(
      f.service.generate("p2", { kind: "codex", model: "", sessionId: issued }),
    ).rejects.toThrow(/実行中/);
    await pending;
    f.setSource(issued);
    await expect(
      f.service.generate("p", { kind: "codex", model: "", sessionId: issued }),
    ).rejects.toThrow(/元の会話/);
  },
);
it.skipIf(process.platform === "win32")(
  "does not launch a process if shutdown happens during preparation",
  async () => {
    const f = await fixture(),
      pending = f.service.generate("p", { kind: "codex", model: "", sessionId: "" });
    f.service.close();
    await expect(pending).rejects.toThrow(/停止/);
    await expect(readFile(f.log, "utf8")).rejects.toThrow();
  },
);
it.skipIf(process.platform === "win32")(
  "uses the canonical GPT model ID for Codex summaries",
  async () => {
    const f = await fixture();
    const result = await f.service.generate("p", {
      kind: "codex",
      model: "GPT-6-Luna",
      sessionId: "",
    });
    const launch = JSON.parse(await readFile(f.log, "utf8"));
    expect(launch.args[launch.args.indexOf("--model") + 1]).toBe("gpt-6-luna");
    expect(result.model).toBe("gpt-6-luna");
    await f.service.generate("p", { kind: "codex", model: "CustomProviderModel", sessionId: "" });
    const custom = JSON.parse(await readFile(f.log, "utf8"));
    expect(custom.args).toContain("CustomProviderModel");
  },
);
it.skipIf(process.platform === "win32")(
  "reports model rejection without exposing the CLI diagnostic",
  async () => {
    const f = await fixture();
    const error = {
      type: "turn.failed",
      error: {
        message:
          "The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account. secret-test",
      },
    };
    await writeFile(
      join(f.dir, "bin", "codex"),
      `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify(error))});process.exit(1);`,
    );
    await expect(
      f.service.generate("p", { kind: "codex", model: "gpt-6-luna", sessionId: "" }),
    ).rejects.toMatchObject({
      code: "summary_model_unavailable",
      message: "要約モデルを利用できません",
    });
  },
);

it.skipIf(process.platform === "win32")(
  "persists per source, reuses unchanged results and summarizes only appended records",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "" };
    const first = await f.service.generate("p", settings);
    const restarted = new SummaryService(f.conversations, join(f.dir, "state"));
    services.push(restarted);
    expect(await restarted.cached("other-pane")).toMatchObject({ text: first.text, stale: false });
    f.read.mockClear();
    await restarted.generate("other-pane", settings);
    expect(f.read).not.toHaveBeenCalled();
    f.append();
    expect(await restarted.cached("p")).toMatchObject({ stale: true });
    await restarted.generate("p", settings);
    expect(f.read.mock.calls[0]?.[2]).toBe(100);
    const prompt = await readFile(join(f.dir, "prompt.txt"), "utf8");
    expect(prompt).toContain(first.text);
    expect(prompt).toContain("追加の依頼");
    expect(prompt).not.toContain("作業を整理して");
    f.read.mockClear();
    await restarted.generate("p", settings, "rebuild");
    expect(f.read.mock.calls[0]?.[2]).toBe(0);
    expect(await readFile(join(f.dir, "prompt.txt"), "utf8")).toContain('"previousSummary":null');
    f.replace();
    f.read.mockClear();
    await restarted.generate("p", settings);
    expect(f.read.mock.calls[0]?.[2]).toBe(0);
    f.setSource("different-session");
    expect(await restarted.cached("p")).toBeNull();
  },
);
it.skipIf(process.platform === "win32")(
  "preserves a cached summary when updating fails; manual mode does not auto-generate",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "" };
    await f.service.auto("p", settings);
    await expect(readFile(f.log)).rejects.toThrow();
    const first = await f.service.generate("p", settings);
    f.append();
    await writeFile(join(f.dir, "bin", "codex"), `#!${process.execPath}\nprocess.exit(1);`);
    await expect(f.service.auto("p", { ...settings, autoUpdate: true })).rejects.toThrow();
    expect(await f.service.cached("p")).toMatchObject({ text: first.text, stale: true });
  },
);

it.skipIf(process.platform === "win32")(
  "rebuilds with a new model when the cached source has appended data",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "" };
    await f.service.generate("p", settings);
    f.append();
    f.read.mockClear();
    await expect(
      f.service.generate("p", { ...settings, model: "different" }),
    ).resolves.toMatchObject({ model: "different" });
    expect(f.read.mock.calls[0]?.[2]).toBe(0);
  },
);

it.skipIf(process.platform === "win32")(
  "rejects a source switch while scanning an empty delta",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "" };
    await f.service.generate("p", settings);
    f.append();
    f.read.mockImplementationOnce(async () => {
      f.setSource("another");
      return { messages: [], nextOffset: null, endOffset: 200, partial: false };
    });
    await expect(f.service.generate("p", settings)).rejects.toThrow("会話が切り替わりました");
  },
);
it.skipIf(process.platform === "win32")(
  "queues a turn completed during summary generation and follows appended conversation",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "", autoUpdate: true };
    const first = f.service.generate("p", settings);
    // Let the initial read finish before adding the next turn.
    await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
    f.append();
    f.service.scheduleAuto("p", () => settings);
    await first;
    await vi.waitFor(
      async () => expect(await f.service.cached("p")).toMatchObject({ stale: false }),
      { timeout: 4000 },
    );
    expect(await readFile(join(f.dir, "prompt.txt"), "utf8")).toContain("追加の依頼");
  },
);

it.skipIf(process.platform === "win32")(
  "continues the unread tail after a bounded partial scan without needing a new turn",
  async () => {
    const f = await fixture(),
      settings = { kind: "codex" as const, model: "m", sessionId: "" };
    f.read.mockImplementationOnce(async () => ({
      messages: [{ role: "user", text: "前半" }],
      nextOffset: null,
      endOffset: 50,
      partial: true,
    }));
    const first = await f.service.generate("p", settings);
    expect(first.stale).toBe(true);
    f.read.mockClear();
    await f.service.generate("p", settings);
    expect(f.read.mock.calls[0]?.[2]).toBe(50);
    expect(await f.service.cached("p")).toMatchObject({ stale: false, partial: true });
  },
);
