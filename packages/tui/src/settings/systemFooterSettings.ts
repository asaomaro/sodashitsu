import {
  SYSTEM_FOOTER_FIELDS,
  SYSTEM_FOOTER_GRAPHS,
  STATUSLINE_GRAPH_PATTERNS,
  statuslineGauge,
  loadSystemFooterSettings,
} from "@sodashitsu/protocol";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { SettingsWriter } from "./SettingsWriter.js";
import type { SettingsSection } from "./items.js";
export function systemFooterSettingsSections(
  prefs: PrefsModel,
  write: SettingsWriter,
): SettingsSection[] {
  const read = () => loadSystemFooterSettings(prefs.shared.systemFooterSettings);
  const update = (change: (s: ReturnType<typeof read>) => void) => {
    const next = read();
    change(next);
    write.setShared({ systemFooterSettings: next });
  };
  return [
    {
      id: "fields",
      label: "フッターの情報",
      items: () =>
        SYSTEM_FOOTER_FIELDS.map((f) => ({
          label: f.label,
          toggle: true,
          value: read().fields.includes(f.id) ? "表示" : "非表示",
          note: "接続先サーバー全体の情報。Web版・端末版で共有します。",
          activate: () =>
            update((s) => {
              s.fields = s.fields.includes(f.id)
                ? s.fields.filter((id) => id !== f.id)
                : [...s.fields, f.id];
            }),
        })),
    },
    {
      id: "graphs",
      label: "使用率グラフ",
      items: () =>
        SYSTEM_FOOTER_GRAPHS.flatMap((g) => [
          {
            label: g.label + "のグラフ",
            toggle: true,
            value: read().graphs[g.id].visible ? "表示" : "非表示",
            note: "グラフを非表示にしても数値は表示します。",
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
                label: p.label + " " + statuslineGauge(50, { visible: true, pattern: p.id }),
                current: p.id === read().graphs[g.id].pattern,
              })),
              pick: (i: number) => {
                const p = STATUSLINE_GRAPH_PATTERNS[i];
                if (p)
                  update((s) => {
                    s.graphs[g.id].pattern = p.id;
                  });
              },
            }),
          },
        ]),
    },
    {
      id: "appearance",
      label: "色の表示",
      items: () => [
        {
          label: "色の表示",
          value: read().colorMode === "color" ? "カラー" : "単色",
          activate: () => ({
            kind: "choose" as const,
            title: "フッターの色",
            options: [
              { label: "単色", current: read().colorMode !== "color" },
              { label: "カラー", current: read().colorMode === "color" },
            ],
            pick: (i: number) => {
              if (i === 0 || i === 1)
                update((s) => {
                  s.colorMode = i === 1 ? "color" : "mono";
                });
            },
          }),
        },
      ],
    },
  ];
}
