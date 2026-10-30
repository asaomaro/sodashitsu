import { describe, expect, it, vi } from "vitest";
import { DesktopAssistantPreferences } from "@sodashitsu/protocol";
import { AssistantController, type NativeAdapter } from "./controller.js";
import { characterBounds } from "./geometry.js";
import { authorizeLocalSender, localRole, sameServerNavigation } from "./security.js";

function fixture(save = vi.fn(async () => {})) {
  const native: NativeAdapter = {
    displays: () => [{ id: "primary", workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    character: vi.fn(),
    hideCharacter: vi.fn(),
    tray: vi.fn(),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    startup: vi.fn(),
  };
  return { native, save, controller: new AssistantController({}, native, save) };
}
describe("assistant native lifecycle", () => {
  it("starts disabled without a character, panel, startup registration or model", () => {
    const { controller, native, save } = fixture();
    expect(native.tray).not.toHaveBeenCalled();
    controller.initialize();
    controller.openPanel();
    expect(native.tray).toHaveBeenCalledOnce();
    expect(native.hideCharacter).toHaveBeenCalledOnce();
    expect(native.character).not.toHaveBeenCalled();
    expect(native.openPanel).not.toHaveBeenCalled();
    expect(native.startup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("switches all three captains and tray mode while keeping the escape path", async () => {
    const { controller, native } = fixture();
    for (const characterId of ["captain-male", "captain-female", "captain-robot"] as const) {
      await controller.update({ ...controller.preferences, enabled: true, characterId });
      expect(native.character).toHaveBeenLastCalledWith(
        expect.objectContaining({ characterId }),
        expect.objectContaining({ width: 192 }),
      );
    }
    await controller.update({ ...controller.preferences, mode: "tray" });
    expect(native.hideCharacter).toHaveBeenCalled();
    controller.openPanel();
    expect(native.openPanel).toHaveBeenCalledWith("http://127.0.0.1:7780");
    await controller.update({ ...controller.preferences, enabled: false });
    expect(native.closePanel).toHaveBeenCalled();
    expect(native.tray).toHaveBeenCalledTimes(5);
  });
  it("leaves windows/state intact on save failure and allows a later retry", async () => {
    const save = vi.fn(async () => {}).mockRejectedValueOnce(Error("disk full"));
    const { controller, native } = fixture(save);
    await expect(controller.update({ enabled: true })).rejects.toThrow("disk full");
    expect(controller.preferences.enabled).toBe(false);
    expect(native.character).not.toHaveBeenCalled();
    await controller.update({ enabled: true });
    expect(controller.preferences.enabled).toBe(true);
  });
  it("rejects unsupported startup before writing preferences", async () => {
    const { controller, native, save } = fixture();
    vi.mocked(native.startup).mockImplementation(() => {
      throw Error("unpackaged");
    });
    await expect(controller.update({ launchAtLogin: true })).rejects.toThrow("unpackaged");
    expect(save).not.toHaveBeenCalled();
    expect(controller.preferences.launchAtLogin).toBe(false);
  });
  it("rolls startup back if saving fails", async () => {
    const { controller, native } = fixture(
      vi.fn(async () => {
        throw Error("disk full");
      }),
    );
    await expect(controller.update({ launchAtLogin: true })).rejects.toThrow("disk full");
    expect(native.startup).toHaveBeenNthCalledWith(1, true);
    expect(native.startup).toHaveBeenNthCalledWith(2, false);
  });
  it("serializes saves and snapshots mutable inputs", async () => {
    let release!: () => void;
    const save = vi
      .fn(async () => {})
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
    const { controller, native } = fixture(save);
    const one = controller.update({ enabled: true });
    const input = { ...controller.preferences, enabled: true, mode: "tray" as const };
    const two = controller.update(input);
    input.enabled = false;
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await one;
    await two;
    expect(controller.preferences.enabled).toBe(true);
    expect(controller.preferences.mode).toBe("tray");
    expect(native.tray).toHaveBeenCalledTimes(2);
    const copy = controller.preferences;
    copy.enabled = false;
    expect(controller.preferences.enabled).toBe(true);
  });
  it("closes the old authenticated panel when the server changes", async () => {
    const { controller, native } = fixture();
    await controller.update({ enabled: true });
    controller.openPanel();
    await controller.update({ enabled: true, serverOrigin: "https://example.test" });
    expect(native.closePanel).toHaveBeenCalledOnce();
    controller.openPanel();
    expect(native.openPanel).toHaveBeenLastCalledWith("https://example.test");
  });
});

describe("monitor geometry", () => {
  const displays = [{ id: "left", workArea: { x: -1280, y: -200, width: 1280, height: 800 } }];
  it("retains negative coordinates and clamps to the selected work area", () => {
    expect(
      characterBounds(
        DesktopAssistantPreferences.parse({ position: { displayId: "left", x: -5000, y: 9999 } }),
        displays,
      ),
    ).toEqual({ x: -1280, y: 408, width: 192, height: 192 });
  });
  it("recovers from a removed monitor and fits small work areas", () => {
    expect(
      characterBounds(
        DesktopAssistantPreferences.parse({
          characterSize: 512,
          position: { displayId: "gone", x: 9000, y: 9000 },
        }),
        [{ id: "small", workArea: { x: 10, y: 20, width: 100, height: 80 } }],
      ),
    ).toEqual({ x: 14, y: 20, width: 80, height: 80 });
  });
});

describe("native IPC authority", () => {
  const sender = {
    frameUrl: "soda-assistant://app/settings.html",
    mainFrame: true,
    current: true,
    role: "settings" as const,
  };
  it("allows a current settings main frame only", () => {
    expect(authorizeLocalSender(sender, "save")).toBe(true);
    expect(authorizeLocalSender({ ...sender, current: false }, "save")).toBe(false);
    expect(authorizeLocalSender({ ...sender, mainFrame: false }, "save")).toBe(false);
    expect(
      authorizeLocalSender({ ...sender, frameUrl: "https://example.test/settings.html" }, "save"),
    ).toBe(false);
    expect(
      authorizeLocalSender(
        { ...sender, frameUrl: "soda-assistant://app/character.html", role: "character" },
        "save",
      ),
    ).toBe(false);
    expect(authorizeLocalSender(sender, "shell")).toBe(false);
  });
  it("rejects URL lookalikes and limits native-free panel navigation to the configured server", () => {
    for (const url of [
      "soda-assistant://evil/settings.html",
      "soda-assistant://app/settings.html?x=1",
      "soda-assistant://app/settings",
      "soda-assistant://user@app/settings.html",
    ])
      expect(localRole(url)).toBeNull();
    expect(sameServerNavigation("https://example.test/login", "https://example.test")).toBe(true);
    expect(sameServerNavigation("https://example.test.evil/login", "https://example.test")).toBe(
      false,
    );
    expect(sameServerNavigation("https://user:secret@example.test/", "https://example.test")).toBe(
      false,
    );
    expect(sameServerNavigation("file:///etc/passwd", "https://example.test")).toBe(false);
  });
});

it("retires independent login startup through the native transition before enabling managed mode", async () => {
 const {native}=fixture();const save=vi.fn(async()=>{});
 const controller=new AssistantController({enabled:false,launchAtLogin:true,serverOrigin:"https://old.invalid"},native,save);
 await controller.initializeManaged("http://127.0.0.1:7781");
 expect(native.startup).toHaveBeenCalledExactlyOnceWith(false);
 expect(save).toHaveBeenCalledWith(expect.objectContaining({enabled:true,launchAtLogin:false,serverOrigin:"http://127.0.0.1:7781"}));
 expect(controller.preferences.launchAtLogin).toBe(false);expect(native.tray).toHaveBeenCalledOnce();
});
it("restores login startup and avoids rendering managed UI when saving the transition fails", async () => {
 const {native}=fixture();const save=vi.fn(async()=>{throw Error("generated disk failure");});
 const controller=new AssistantController({enabled:false,launchAtLogin:true},native,save);
 await expect(controller.initializeManaged("http://127.0.0.1:7781")).rejects.toThrow("generated disk failure");
 expect(native.startup).toHaveBeenNthCalledWith(1,false);expect(native.startup).toHaveBeenNthCalledWith(2,true);
 expect(controller.preferences.enabled).toBe(false);expect(controller.preferences.launchAtLogin).toBe(true);
 expect(native.tray).not.toHaveBeenCalled();expect(native.character).not.toHaveBeenCalled();
});
it("does not persist or render if retiring the OS login entry fails", async () => {
 const {native}=fixture();vi.mocked(native.startup).mockImplementation(()=>{throw Error("generated startup failure");});
 const save=vi.fn(async()=>{}),controller=new AssistantController({launchAtLogin:true},native,save);
 await expect(controller.initializeManaged("http://127.0.0.1:7781")).rejects.toThrow("generated startup failure");
 expect(save).not.toHaveBeenCalled();expect(native.tray).not.toHaveBeenCalled();
});
