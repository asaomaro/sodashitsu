import { expect, it, vi } from "vitest";
import { systemFooterSettingsSections } from "./systemFooterSettings.js";
import { PrefsModel } from "../model/PrefsModel.js";
import type { SettingsWriter } from "./SettingsWriter.js";
import { loadSystemFooterSettings } from "@sodashitsu/protocol";
it("configures agent counts and independent graphs while retaining enabled and old fields", () => {
  const prefs = new PrefsModel();
  prefs.apply({ systemFooterSettings: { enabled: true, fields: ["cpu", "memory"] } }, 1);
  const write = {
    setShared: vi.fn((patch) => prefs.apply({ ...prefs.shared, ...patch }, prefs.rev + 1)),
  } as unknown as SettingsWriter;
  const sections = systemFooterSettingsSections(prefs, write);
  sections[0]!.items().find((i) => i.label === "エージェント総数")!.activate!();
  sections[1]!.items()[0]!.activate!();
  const choice = sections[1]!.items()[1]!.activate!();
  if (!choice || typeof choice === "string" || choice.kind !== "choose")
    throw Error("choose expected");
  expect(choice.options.find(p => p.label.startsWith("半段階ブロック"))?.label).toBe("半段階ブロック（5個） ██▒░░ 50%");
  choice.pick(4);
  const settings = loadSystemFooterSettings(prefs.shared.systemFooterSettings);
  expect(settings.enabled).toBe(true);
  expect(settings.fields).toEqual(["cpu", "memory", "agents"]);
  expect(settings.graphs.cpu).toEqual({ visible: true, pattern: "halfBlocks" });
  expect(settings.graphs.memory.visible).toBe(false);
});
