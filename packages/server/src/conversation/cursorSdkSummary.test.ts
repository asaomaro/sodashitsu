import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CursorSdkSummarySupervisor } from "./cursorSdkSummary.js";

const dirs: string[] = [], supervisors: CursorSdkSummarySupervisor[] = [];
afterEach(async () => { for (const s of supervisors.splice(0)) s.close(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });
async function setup(body: string, options: { deadlineMs?: number; accessIntervalMs?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), "soda-sdk-supervisor-test-")); dirs.push(root);
  const worker = join(root, "fixture.mjs"), temps = join(root, "temps");
  await import("node:fs/promises").then(fs => fs.mkdir(temps));
  await writeFile(worker, `import {writeFileSync} from 'node:fs';let text='';for await(const c of process.stdin)text+=c;const input=JSON.parse(text);${body}`);
  const supervisor = new CursorSdkSummarySupervisor({ worker: pathToFileURL(worker), tempRoot: temps, authPath: async () => "/fixture/sdk/auth.json", ...options });
  supervisors.push(supervisor);
  const job = { model: "fixture-model", prompt: "private-summary-input", check: () => undefined };
  return { root, temps, supervisor, job };
}
describe("Cursor SDK owned worker", () => {
  it("uses private HOME/cwd/store, secret only stdin and waits for physical exit before cleanup", async () => {
    vi.stubEnv("CURSOR_API_KEY", "own-secret");vi.stubEnv("CURSOR_BACKEND_URL", "http://do-not-inherit");
    const f = await setup(`if(process.argv.join(' ').includes('own-secret')||process.env.CURSOR_API_KEY||process.env.CURSOR_BACKEND_URL||!input.apiKey||process.env.HOME===undefined)process.exit(2);process.stdout.write(JSON.stringify({ok:true,text:'fixture summary'}));setTimeout(()=>{process.disconnect()},140);`);
    let settled = false;
    const promise = f.supervisor.run(f.job).then(value => { settled = true; return value; });
    await vi.waitFor(async () => expect((await readdir(f.temps)).length).toBe(1));
    expect(settled).toBe(false);
    expect(await promise).toEqual({ text: "fixture summary", sessionId: null });
    expect(await readdir(f.temps)).toEqual([]);
  });
  it("reports missing SDK auth without exposing arbitrary worker/provider diagnostics", async () => {
    const f = await setup(`process.stderr.write('secret');process.stdout.write(JSON.stringify({ok:false,reason:'unavailable'}));process.disconnect();process.exitCode=1;`);
    await expect(f.supervisor.run(f.job)).rejects.toMatchObject({ code: "unsupported_agent_kind" });
    expect(await readdir(f.temps)).toEqual([]);
  });
  it.each([`process.stdout.write('secret malformed');process.disconnect();`, `process.stdout.write(JSON.stringify({ok:true,text:'x'.repeat(128*1024+1)}));process.disconnect();`])("rejects malformed and oversized output", async body => {
    const f = await setup(body);await expect(f.supervisor.run(f.job)).rejects.toMatchObject({ code: "agent_prompt_failed" });expect(await readdir(f.temps)).toEqual([]);
  });
  it("hard-stops an owned uncooperative process at deadline", async () => {
    const f = await setup(`setInterval(()=>{},1000);`, { deadlineMs: 30 });
    await expect(f.supervisor.run(f.job)).rejects.toMatchObject({ code: "agent_prompt_failed" });expect(await readdir(f.temps)).toEqual([]);
  });
  it("sends cancellation on scope change, rejects late success, then cleans after exit", async () => {
    const f = await setup(`writeFileSync(input.cwd+'/ready','');process.on('message',m=>{if(m==='cancel'){writeFileSync(input.cwd+'/cancelled','');process.stdout.write(JSON.stringify({ok:true,text:'late result'}));setTimeout(()=>process.disconnect(),30)}});`, { accessIntervalMs: 10 });
    let valid = true;const pending=f.supervisor.run({ ...f.job, check: () => {if(!valid)throw Error('private-source-details')} });
    await vi.waitFor(async () => {const [dir]=await readdir(f.temps);expect(dir).toBeTruthy();await access(join(f.temps,dir!,"work","ready"));});valid=false;
    await expect(pending).rejects.toMatchObject({ code: "agent_prompt_failed" });expect(await readdir(f.temps)).toEqual([]);
  });
  it("rechecks scope after worker exit even between access timer ticks", async () => {
    const f = await setup(`writeFileSync(input.cwd+'/ready','');setTimeout(()=>{process.stdout.write(JSON.stringify({ok:true,text:'late result'}));process.disconnect()},160);`, { accessIntervalMs: 10000 });
    let valid=true;
    const pending=f.supervisor.run({...f.job,check:()=>{if(!valid)throw Error('scope changed')}});
    await vi.waitFor(async()=>{const [dir]=await readdir(f.temps);await access(join(f.temps,dir!,"work","ready"));});valid=false;
    await expect(pending).rejects.toMatchObject({code:'agent_prompt_failed'});expect(await readdir(f.temps)).toEqual([]);
  });
  it("close cancels live work and prevents new jobs", async () => {
    const f=await setup(`writeFileSync(input.cwd+'/ready','');process.on('message',()=>process.disconnect());`,{accessIntervalMs:10});
    const pending=f.supervisor.run(f.job);
    await vi.waitFor(async()=>{const [dir]=await readdir(f.temps);await access(join(f.temps,dir!,"work","ready"));});f.supervisor.close();
    await expect(pending).rejects.toThrow();await expect(f.supervisor.run(f.job)).rejects.toThrow();expect(await readdir(f.temps)).toEqual([]);
  });
  it("rejects session reuse and unsupported explicit effort before worker launch", async () => {
    const f=await setup(`process.exit(9)`);
    await expect(f.supervisor.run({...f.job,sessionId:'old-session'})).rejects.toMatchObject({code:'invalid_params'});
    await expect(f.supervisor.run({...f.job,effort:'high'})).rejects.toMatchObject({code:'invalid_params'});expect(await readdir(f.temps)).toEqual([]);
  });
});
