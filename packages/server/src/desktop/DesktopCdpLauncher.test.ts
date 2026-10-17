import { afterEach, expect, it, vi } from "vitest";
import { ChildProcess } from "node:child_process";
import { DesktopCdpLauncher } from "./DesktopCdpLauncher.js";

const jobs: {cancel():void}[] = [];
afterEach(() => { for (const job of jobs.splice(0)) job.cancel(); });
const fixture = (script: string) => new DesktopCdpLauncher([process.execPath, "-e", script]);
const input = `let text='';process.stdin.on('data',b=>{text+=b; if(!text.includes('\\n'))return;const m=JSON.parse(text);`;
it("is opt-in and rejects non-argv configuration", () => {
  expect(new DesktopCdpLauncher().available).toBe(false);
  for (const invalid of ['{}', '[]', '["node",null]', '["node","a\\u0000b"]', 'not json'])
    expect(() => DesktopCdpLauncher.fromEnvironment(invalid)).toThrow("JSON argv array");
  expect(DesktopCdpLauncher.fromEnvironment('["node","fixed script"]')).toHaveProperty("available",true);
});
it("discovers bounded targets through a fixed process, waiting for its exit", async () => {
  const launcher = fixture(input + `console.log(JSON.stringify({type:'targets',targets:[{id:'source-1',title:'VSCode'}]}));process.stdin.destroy();});`);
  const job = launcher.start({type:"discover"}); jobs.push(job);
  expect(launcher.busy).toBe(true);
  expect(() => launcher.start({type:"discover"})).toThrow("使用中");
  await expect(job.result).resolves.toEqual([{id:"source-1",title:"VSCode"}]);
  expect(launcher.busy).toBe(false);
});
it("keeps a connected helper owned until cancel closes stdin, without token in argv", async () => {
  const token = "a".repeat(64);
  const launcher = fixture(input + `if(process.argv.some(a=>a.includes(m.token)))process.exit(3);console.log(JSON.stringify({type:'connecting'}));});process.stdin.on('end',()=>process.exit(0));`);
  const job = launcher.start({type:"connect",targetId:"chosen",token}); jobs.push(job);
  await expect(job.result).resolves.toEqual([]);
  expect(launcher.busy).toBe(true);
  job.cancel();
  await expect.poll(() => launcher.busy).toBe(false);
});
it("rejects malformed targets, oversized output and helper errors without exposing stderr", async () => {
  for (const script of [
    input + `console.log(JSON.stringify({type:'targets',targets:[{id:'bad/path',title:'bad'}]}));});`,
    `process.stdout.write('x'.repeat(40000));process.stdin.resume();`,
    `console.error('SECRET');process.exit(1);`,
  ]) {
    const launcher = fixture(script);
    const job = launcher.start({type:"discover"}); jobs.push(job);
    await expect(job.result).rejects.not.toThrow("SECRET");
    await expect.poll(() => launcher.busy).toBe(false);
  }
});
it("cancel invalidates a pending result and releases the process slot", async () => {
  const launcher = fixture("process.stdin.resume();process.stdin.on('end',()=>process.exit(0));");
  const job = launcher.start({type:"discover"}); jobs.push(job);
  const failed = expect(job.result).rejects.toThrow("取り消しました");
  job.cancel(); await failed;
  await expect.poll(() => launcher.busy).toBe(false);
});

it("does not force-kill a connected helper during slow cleanup", async () => {
  const launcher=fixture(input+`console.log(JSON.stringify({type:'connecting'}));});process.stdin.on('end',()=>setTimeout(()=>process.exit(0),200));`);
  const job=launcher.start({type:"connect",targetId:"chosen",token:"a".repeat(64)});jobs.push(job);
  await job.result;
  const kill=vi.spyOn(ChildProcess.prototype,"kill");
  vi.useFakeTimers();
  try {
    job.cancel();await vi.advanceTimersByTimeAsync(6000);
    expect(kill).not.toHaveBeenCalled();
  } finally {vi.useRealTimers();kill.mockRestore();}
  await job.closed;expect(launcher.busy).toBe(false);
});
