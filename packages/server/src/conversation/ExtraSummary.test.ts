import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { SummaryService } from "./SummaryService.js";
import type { ConversationService } from "./ConversationService.js";
const dirs: string[] = [],
  services: SummaryService[] = [];
afterEach(async () => {
  services.splice(0).forEach((s) => s.close());
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
it.skipIf(process.platform === "win32").each(["muse", "copilot"] as const)(
  "%s report uses a private configuration and no built-in tools",
  async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), "soda-extra-summary-"));
    dirs.push(dir);
    const bin = join(dir, "bin"),
      original = join(dir, "original");
    await mkdir(bin);
    await mkdir(join(original, "muse"), { recursive: true });
    await writeFile(join(original, "muse", "auth.json"), "{}");
    await writeFile(
      join(original, "config.json"),
      JSON.stringify({
        copilot_tokens: { fake: "test" },
        hooks: { dangerous: true },
        mcpServers: { dangerous: true },
      }),
    );
    const log = join(dir, "log.json");
    await writeFile(
      join(bin, kind),
      `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2),kind=${JSON.stringify(kind)};const home=kind==='muse'?path.join(process.env.XDG_CONFIG_HOME,'muse'):process.env.COPILOT_HOME;fs.writeFileSync(${JSON.stringify(log)},JSON.stringify({args,home,config:fs.readFileSync(path.join(home,kind==='muse'?'settings.json':'config.json'),'utf8'),soda:process.env.SODA_PANE_ID}));console.log(JSON.stringify(kind==='muse'?{schema_version:1,payload_type:'run.terminal.completed',payload:{terminal:'completed',text:'分析結果'}}:{type:'assistant.message',data:{content:'分析結果'}}));`,
    );
    await chmod(join(bin, kind), 0o755);
    vi.stubEnv("PATH", bin + delimiter + process.env.PATH);
    vi.stubEnv("XDG_CONFIG_HOME", original);
    vi.stubEnv("COPILOT_HOME", original);
    vi.stubEnv("SODA_PANE_ID", "parent");
    const service = new SummaryService(
      { isActive: () => false } as unknown as ConversationService,
      join(dir, "state"),
    );
    services.push(service);
    const result = await service.usageReport({ kind, model: "test" }, {});
    expect(result.text).toBe("分析結果");
    const launch = JSON.parse(await readFile(log, "utf8"));
    expect(launch.home).not.toBe(original);
    expect(launch.config).not.toContain("dangerous");
    expect(launch.soda).toBeUndefined();
    expect(launch.args).not.toContain("--allow-all-tools");
    expect(launch.args).toContain(kind === "muse" ? "--preset" : "--deny-tool");
  },
);
