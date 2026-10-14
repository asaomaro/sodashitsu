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
  expect(choice.options.find((p) => p.label.startsWith("半段階ブロック"))?.label).toBe(
    "半段階ブロック（5個） ██▒░░ 50%",
  );
  choice.pick(4);
  const s = loadStatuslineSettings(prefs.shared.statuslineSettings);
  expect(s.fields.pane).toBe(false);
  expect(s.fields.model).toBe(true);
  expect(s.graphs.context).toEqual({ visible: false, pattern: "halfBlocks" });
  expect(s.graphs.weekly.visible).toBe(true);
  const appearance = sections
    .flatMap((section) => section.items())
    .find((item) => item.label === "色の表示")!.activate!();
  if (!appearance || typeof appearance === "string" || appearance.kind !== "choose")
    throw Error("choose expected");
  appearance.pick(0);
  expect(loadStatuslineSettings(prefs.shared.statuslineSettings).colorMode).toBe("mono");
});
