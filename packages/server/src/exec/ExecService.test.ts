import { afterEach, expect, it } from "vitest";
import { join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { ExecService } from "./ExecService.js";

const services: ExecService[] = [];
afterEach(() => services.splice(0).forEach(s => s.dispose()));
const shellQuote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
const command = (source: string) => {
  const script = `eval(Buffer.from('${Buffer.from(source).toString("base64")}','base64').toString('utf8'))`;
  return process.platform === "win32" ? `"${process.execPath}" -e "${script}"` : `${shellQuote(process.execPath)} -e ${shellQuote(script)}`;
};
function service() { const s = new ExecService(); services.push(s); return s; }
async function done(s: ExecService, id: string) {
  await expect.poll(() => s.read("a", id).status).toBe("exited"); return s.read("a", id);
}
it("returns separate UTF-8 output, exact cwd and nonzero exit code without a PTY", async () => {
  const s = service(), { id } = s.start("a", { cwd: process.cwd(), timeoutMs: 5000,
    command: command('process.stdout.write(process.cwd()+"\\n日本語");process.stderr.write("diagnostic");process.exitCode=7') });
  const result = await done(s, id);
  expect(result).toMatchObject({ stdout: process.cwd()+"\n日本語", stderr: "diagnostic", exitCode: 7, timedOut: false, cancelled: false });
  expect(() => s.read("other", id)).toThrow(/not found/);
  expect(() => s.cancel("other", id)).toThrow(/not found/);
});
it("bounds both output streams and marks truncation", async () => {
  const s = service(), { id } = s.start("a", { cwd: process.cwd(), timeoutMs: 5000,
    command: command('process.stdout.write("a".repeat(70000));process.stderr.write("b".repeat(70000))') });
  const r = await done(s, id);
  expect(r.stdout).toHaveLength(65536); expect(r.stderr).toHaveLength(65536);
  expect(r).toMatchObject({ stdoutTruncated: true, stderrTruncated: true, exitCode: 0 });
});
it("kills timed-out jobs and supports explicit cancellation", async () => {
  const s = service(), p = { cwd: process.cwd(), command: command('setInterval(()=>{},1000)'), timeoutMs: 100 };
  const first = s.start("a", p); expect(await done(s, first.id)).toMatchObject({ timedOut: true });
  const second = s.start("a", { ...p, timeoutMs: 5000 }); s.cancel("a", second.id);
  expect(await done(s, second.id)).toMatchObject({ cancelled: true, timedOut: false });
});
it("removes disconnected jobs and rejects invalid target paths and excess concurrency", () => {
  const s = service();
  expect(() => s.start("a", { cwd: "relative", command: "echo test", timeoutMs: 1 })).toThrow(process.platform === "win32" ? /drive-qualified/ : /absolute/);
  expect(() => s.start("a", { cwd: join(parse(process.cwd()).root, "soda-missing-" + randomUUID()), command: "echo test", timeoutMs: 1 })).toThrow(/not found/);
  const jobs = Array.from({length: 4}, () => s.start("a", { cwd: process.cwd(), command: command('setInterval(()=>{},1000)'), timeoutMs: 5000 }));
  expect(() => s.start("a", { cwd: process.cwd(), command: "echo test", timeoutMs: 1 })).toThrow(/Too many/);
  s.clientGone("a"); for (const job of jobs) expect(() => s.read("a", job.id)).toThrow(/not found/);
});

it("decodes CP932 output when the caller selects shift_jis", async () => {
  const s = service(), {id} = s.start("a", {cwd:process.cwd(),timeoutMs:5000,encoding:"shift_jis",
    command:command('process.stdout.write(Buffer.from([0x93,0xfa,0x96,0x7b,0x8c,0xea]))')});
  expect((await done(s,id)).stdout).toBe("日本語");
});
