import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopSettings, bundledDesktopCommand } from "./DesktopSettings.js";
import { DesktopProvider } from "./DesktopProvider.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const off = { enabled: false, allowInput: false, allowClipboard: false, allowDisplayResize: false };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "desktop-permissions-"));
  dirs.push(dir);
  const provider = new DesktopProvider(undefined);
  return {
    file: join(dir, "permissions.json"),
    provider,
    origins: () => ["https://controller.example"],
    command: ["synthetic-helper"],
  };
}
it("does not enable capture merely because a bundled helper exists; persists permissions and revokes current shares", async () => {
  const options = await fixture(),
    stop = vi.spyOn(options.provider, "dispose");
  const settings = await DesktopSettings.open(options);
  expect(settings.get(true)).toEqual({ permissions: off, supported: true, canConfigure: true });
  expect(options.provider.capabilities().available).toBe(false);
  const on = { enabled: true, allowInput: true, allowClipboard: true, allowDisplayResize: false };
  await settings.set(on);
  expect(options.provider.capabilities()).toMatchObject({
    available: true,
    allowInput: true,
    displayResize: false,
  });
  expect(JSON.parse(await readFile(options.file, "utf8"))).toEqual(on);
  expect((await DesktopSettings.open(options)).get(false).permissions).toEqual(on);
  const count = stop.mock.calls.length;
  await settings.set(off);
  expect(stop).toHaveBeenCalledTimes(count + 1);
  expect(options.provider.capabilities().available).toBe(false);
  expect((await DesktopSettings.open(options)).get(true).permissions.enabled).toBe(false);
});
it("fails closed on corrupt permissions even if a legacy command enables sharing", async () => {
  const options = await fixture();
  await writeFile(options.file, '{"enabled":true}');
  const settings = await DesktopSettings.open({
    ...options,
    legacy: { command: ["synthetic"], allowInput: true, origins: options.origins },
  });
  expect(settings.get(true).permissions).toEqual(off);
  expect(options.provider.capabilities().available).toBe(false);
});
it("startup flags override saved settings for that launch and permissions can still be revoked live", async () => {
  const options = await fixture();
  await writeFile(options.file, JSON.stringify(off));
  const settings = await DesktopSettings.open({ ...options, startup: { ...off, enabled: true } });
  expect(options.provider.capabilities()).toMatchObject({ available: true, allowInput: false });
  await settings.set(off);
  expect(options.provider.capabilities().available).toBe(false);
});
it("discovers the shipped Windows files without executing PowerShell or requiring a custom command", () => {
  expect(bundledDesktopCommand("win32")).toEqual(
    expect.arrayContaining([
      "powershell.exe",
      "-File",
      expect.stringContaining("windows-helper.ps1"),
    ]),
  );
  expect(bundledDesktopCommand("linux", {})).toBeUndefined();
});
it("serializes concurrent writes so stored permissions match effective permissions", async () => {
  const options = await fixture(),
    settings = await DesktopSettings.open(options);
  await Promise.all([settings.set({ ...off, enabled: true }), settings.set(off)]);
  expect(JSON.parse(await readFile(options.file, "utf8"))).toEqual(settings.get(true).permissions);
});

it("keeps explicit SSH destinations when using the bundled command without legacy env", async () => {
  const { desktopOriginsFromEnv, desktopConfigFromEnv } = await import("./DesktopProvider.js");
  const options = await fixture(),
    env = { SODA_DESKTOP_ORIGINS: "https://controller.example" };
  expect(desktopConfigFromEnv(env, () => [])).toBeUndefined();
  const origins = desktopOriginsFromEnv(env, () => ["https://delegate.example"]);
  const configure = vi.spyOn(options.provider, "configure");
  const settings = await DesktopSettings.open({ ...options, origins });
  await settings.set({ ...off, enabled: true });
  expect(configure.mock.calls.at(-1)![0]!.origins()).toEqual([
    "https://controller.example",
    "https://delegate.example",
  ]);
});

it("persists opt-in unlock and ties its lease to provider disposal; old permissions stay compatible", async () => {
  const options = await fixture(), configure = vi.spyOn(options.provider, "configure");
  // Stub native spawn only; inspect the actual permission-to-command mapping.
  const { DesktopUnlockLease } = await import("./DesktopUnlockLease.js");
  const start = vi.spyOn(DesktopUnlockLease.prototype,"start").mockImplementation(()=>undefined);
  const stop = vi.spyOn(DesktopUnlockLease.prototype,"stop").mockImplementation(()=>undefined);
  try {
    const settings = await DesktopSettings.open(options);
    expect(start).not.toHaveBeenCalled();
    await settings.set({...off,enabled:true,allowInput:true,allowUnlock:true});
    expect(configure.mock.calls.at(-1)![0]).toMatchObject({allowUnlock:true,command:["synthetic-helper","-AllowInput","-AllowUnlock"]});
    expect(start).toHaveBeenLastCalledWith(["synthetic-helper","-UnlockLease"]);
    expect(JSON.parse(await readFile(options.file,"utf8"))).toMatchObject({allowUnlock:true});
    const stopped = stop.mock.calls.length;
    options.provider.dispose();
    expect(stop.mock.calls.length).toBe(stopped+1);
    await settings.set(off);
    expect(configure.mock.calls.at(-1)![0]).toBeUndefined();
  } finally { start.mockRestore();stop.mockRestore(); }
});

it("persists a locally approved file root and refuses invalid roots before changing permissions",async()=>{const options=await fixture(),settings=await DesktopSettings.open(options),root=dirname(options.file);await settings.set({...off,enabled:true,fileRoot:root});expect(options.provider.capabilities()).toMatchObject({files:true});expect((await DesktopSettings.open(options)).get(true).permissions.fileRoot).toBe(root);await expect(settings.set({...off,enabled:true,fileRoot:"relative-directory"})).rejects.toThrow("絶対パス");expect(settings.get(true).permissions.fileRoot).toBe(root);await settings.set({...off,enabled:true,fileRoot:""});expect(options.provider.capabilities()).toMatchObject({files:false});});
