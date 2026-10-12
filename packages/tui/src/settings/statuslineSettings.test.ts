import { expect, it, vi } from "vitest";
import { statuslineSettingsSections } from "./statuslineSettings.js";
import { PrefsModel } from "../model/PrefsModel.js";
import type { SettingsWriter } from "./SettingsWriter.js";
import { loadStatuslineSettings } from "@sodashitsu/protocol";
it("toggles fields and graph visibility, chooses patterns and preserves unrelated selections", () => {
  const prefs = new PrefsModel();
  const write = {
    setShared: vi.fn((patch) => prefs.apply({ ...prefs.shared, ...patch }, prefs.rev + 1)),
  } as unknown as SettingsWriter;
  const sections = statuslineSettingsSections(prefs, write);
  sections[0]!.items()[0]!.activate?.();
  sections[1]!.items()[0]!.activate?.();
  const choice = sections[1]!.items()[1]!.activate?.();
  if (!choice || typeof choice === "string" || choice.kind !== "choose")
    throw Error("choose expected");
  choice.pick(2);
  const s = loadStatuslineSettings(prefs.shared.statuslineSettings);
  expect(s.fields.pane).toBe(false);
  expect(s.fields.model).toBe(true);
  expect(s.graphs.context).toEqual({ visible: false, pattern: "dots" });
  expect(s.graphs.weekly.visible).toBe(true);
});
