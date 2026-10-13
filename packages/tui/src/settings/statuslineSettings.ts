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
        read()
          .order.map((id) => STATUSLINE_FIELDS.find((f) => f.id === id)!)
          .map((f) => ({
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
    {
      id: "general",
      label: "全体・順序",
      items: () => [
        {
          label: "ペイン最下部に表示",
          toggle: true,
          value: read().enabled ? "表示" : "非表示",
          activate: () =>
            update((s) => {
              s.enabled = !s.enabled;
            }),
        },
        {
          label: "1000をk表記",
          toggle: true,
          value: read().tokenFormat === "k" ? "k" : "実数",
          activate: () =>
            update((s) => {
              s.tokenFormat = s.tokenFormat === "k" ? "exact" : "k";
            }),
        },
        {
          label: "表示桁数を自動に戻す",
          value: read().columns === null ? "自動" : String(read().columns),
          activate: () =>
            update((s) => {
              s.columns = null;
            }),
        },
        ...read().order.map((id, index) => ({
          label: `${index + 1}. ${STATUSLINE_FIELDS.find((f) => f.id === id)!.label}の位置`,
          activate: () => ({
            kind: "choose" as const,
            title: "移動先の表示位置",
            options: read().order.map((other, i) => ({
              label: `${i + 1}. ${STATUSLINE_FIELDS.find((f) => f.id === other)!.label}`,
              current: i === index,
            })),
            pick: (to: number) =>
              update((s) => {
                const from = s.order.indexOf(id);
                if (to < 0 || to >= s.order.length) return;
                s.order.splice(from, 1);
                s.order.splice(to, 0, id);
              }),
          }),
        })),
      ],
    },
  ];
}
