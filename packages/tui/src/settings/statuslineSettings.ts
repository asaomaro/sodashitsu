import {
  STATUSLINE_FIELDS,
  STATUSLINE_GRAPHS,
  STATUSLINE_GRAPH_PATTERNS,
  loadStatuslineSettings,
  type StatuslineSettings,
} from "@sodashitsu/protocol";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { SettingsWriter } from "./SettingsWriter.js";
import type { SettingsSection } from "./items.js";
export function statuslineSettingsSections(
  prefs: PrefsModel,
  write: SettingsWriter,
): SettingsSection[] {
  const read = () => loadStatuslineSettings(prefs.shared.statuslineSettings);
  const update = (change: (s: StatuslineSettings) => void) => {
    const next = read();
    change(next);
    write.setShared({ statuslineSettings: next });
  };
  return [
    {
      id: "fields",
      label: "表示する情報",
      items: () =>
        STATUSLINE_FIELDS.map((f) => ({
          label: f.label,
          toggle: true,
          value: read().fields[f.id] ? "表示" : "非表示",
          note: "すべてのstatuslineに反映し、Web版・端末版で共有します。",
          activate: () =>
            update((s) => {
              s.fields[f.id] = !s.fields[f.id];
            }),
        })),
    },
    {
      id: "graphs",
      label: "利用状況グラフ",
      items: () =>
        STATUSLINE_GRAPHS.flatMap((g) => [
          {
            label: g.label + "のグラフ",
            toggle: true,
            value: read().graphs[g.id].visible ? "表示" : "非表示",
            note: "非表示でも数値は表示します。",
            activate: () =>
              update((s) => {
                s.graphs[g.id].visible = !s.graphs[g.id].visible;
              }),
          },
          {
            label: g.label + "のパターン",
            value: STATUSLINE_GRAPH_PATTERNS.find((p) => p.id === read().graphs[g.id].pattern)!
              .label,
            activate: () => ({
              kind: "choose" as const,
              title: g.label + "のグラフパターン",
              options: STATUSLINE_GRAPH_PATTERNS.map((p) => ({
                label: p.label + " " + p.filled.repeat(4) + p.empty.repeat(4),
                current: p.id === read().graphs[g.id].pattern,
              })),
              pick: (i: number) => {
                const pattern = STATUSLINE_GRAPH_PATTERNS[i];
                if (pattern)
                  update((s) => {
                    s.graphs[g.id].pattern = pattern.id;
                  });
              },
            }),
          },
        ]),
    },
  ];
}
