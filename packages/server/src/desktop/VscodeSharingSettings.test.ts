import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopCdpLauncher } from "./DesktopCdpLauncher.js";
import { VscodeSharingSettings } from "./VscodeSharingSettings.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const off = { enabled: false, allowInput: false, allowFit: false };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "soda-vscode-settings-"));
  dirs.push(dir);
  const launcher = new DesktopCdpLauncher(),
    changed = vi.fn();
  const command = vi.fn(() => [
    process.execPath,
    "-e",
    `process.stdin.once('data',()=>{console.log(JSON.stringify({type:'targets',targets:[{id:'target',title:'VSCode'}]}));process.stdin.destroy();});`,
  ]);
  const options = {
    file: join(dir, "settings.json"),
    launcher,
    origin: () => "http://127.0.0.1:7780",
    changed,
    supported: () => true,
    command,
  };
  return {
    options,
    launcher,
    changed,
    command,
    settings: await VscodeSharingSettings.create(options),
  };
}
it("defaults off, saves local permission, and only invokes the fixed helper when the user presses launch", async () => {
  const h = await fixture();
  expect(h.launcher.available).toBe(false);
  expect(h.settings.get(true).permissions).toEqual(off);
  const on = { enabled: true, allowInput: true, allowFit: true };
  await h.settings.set(on);
  expect(h.launcher.available).toBe(true);
  expect(h.command).not.toHaveBeenCalled();
  const job = h.launcher.start({ type: "discover" });
  try {
    await expect(job.result).resolves.toEqual([{ id: "target", title: "VSCode" }]);
  } finally {
    job.cancel();
    await job.closed;
  }
  expect(h.command).toHaveBeenCalledWith(on);
  const reloaded = await VscodeSharingSettings.create({
    ...h.options,
    launcher: new DesktopCdpLauncher(),
  });
  expect(reloaded.get(false)).toMatchObject({ permissions: on, canConfigure: false });
  await h.settings.set(off);
  expect(h.launcher.available).toBe(false);
  expect(h.changed).toHaveBeenCalledTimes(2);
});
it("requires input permission for fit and preserves the existing administrator command", async () => {
  const h = await fixture();
  await expect(
    h.settings.set({ enabled: true, allowInput: false, allowFit: true }),
  ).rejects.toThrow("操作の許可");
  const legacy = new DesktopCdpLauncher(["fixed-helper", "--allow-input"]);
  const settings = await VscodeSharingSettings.create({
    ...h.options,
    file: h.options.file + "-legacy",
    launcher: legacy,
  });
  expect(settings.get(true)).toMatchObject({ customCommand: true, permissions: { enabled: true } });
  await settings.set(off);
  expect(legacy.available).toBe(false);
});

it("fails closed on a corrupt saved file even when a legacy command exists", async () => {
  const h = await fixture();
  for (const value of [
    "bad json",
    JSON.stringify({ enabled: true }),
    JSON.stringify({ enabled: true, allowInput: false, allowFit: true }),
  ]) {
    await writeFile(h.options.file, value);
    const launcher = new DesktopCdpLauncher(["legacy"]);
    const loaded = await VscodeSharingSettings.create({ ...h.options, launcher });
    expect(loaded.get(true).permissions).toEqual(off);
    expect(launcher.available).toBe(false);
  }
});
it("saves a certificate-valid helper URL and cancels an active auto-launch when disabled", async () => {
  const h = await fixture();
  await h.settings.set({
    enabled: true,
    allowInput: false,
    allowFit: false,
    sodaOrigin: "https://soda.example.test",
  });
  expect(h.settings.get(true).permissions.sodaOrigin).toBe("https://soda.example.test");
  const blocking = [
    process.execPath,
    "-e",
    "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));",
  ];
  h.command.mockReturnValue(blocking);
  const job = h.launcher.start({ type: "discover" });
  const cancelled = expect(job.result).rejects.toThrow("取り消しました");
  await h.settings.set(off);
  await cancelled;
  await job.closed;
  expect(h.launcher.available).toBe(false);
});
