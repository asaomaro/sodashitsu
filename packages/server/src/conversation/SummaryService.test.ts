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
    `#!${process.execPath}\nimport {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';const args=process.argv.slice(2);writeFileSync(${JSON.stringify(log)},JSON.stringify({args,home:process.env.CODEX_HOME,config:readFileSync(join(process.env.CODEX_HOME,'config.toml'),'utf8')}));process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{writeFileSync(args[args.indexOf('--output-last-message')+1],'目的: 作業を整理する');console.log(JSON.stringify({type:'thread.started',thread_id:'${issued}'}));},150));`,
  );
  await chmod(join(bin, "codex"), 0o755);
  vi.stubEnv("PATH", bin + delimiter + process.env.PATH);
  vi.stubEnv("CODEX_HOME", home);
  let sourceId = "source";
  const conversations = {
    isActive: () => false,
    source: () => ({ kind: "codex", sessionId: sourceId }),
    read: async () => ({
      messages: [{ role: "user", text: "作業を整理して" }],
      nextOffset: null,
      partial: false,
    }),
  } as unknown as ConversationService;
  const service = new SummaryService(conversations, join(dir, "state"));
  services.push(service);
  return { service, dir, log, home, setSource: (id: string) => (sourceId = id) };
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
