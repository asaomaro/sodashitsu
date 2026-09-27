import {
  BUILTIN_TOKENS,
  builtinToken,
  effectiveLayout,
  isTextValued,
  isTextWhen,
  isValidColor,
  isValidCustomToken,
  loadSidebarRows,
  MAX_CUSTOM_NAME,
  MAX_ROWS,
  MAX_RULE_TEXT,
  MAX_RULES,
  MAX_TOKENS_PER_ROW,
  parseFiniteNumber,
  serializeSidebarRows,
  SIDEBAR_AREAS,
  type RowLayout,
  type RuleWhen,
  type SidebarArea,
  type TokenRule,
  type TokenSpec,
  type TokenStyle,
} from "@sodashitsu/client-core";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { ChoiceOption, Outcome, SettingItem } from "./items.js";
import type { SettingsWriter } from "./SettingsWriter.js";

/**
 * サイドバーの行の並び（web の `SidebarRowsSettings.vue`。herdr の `[ui.sidebar.*].rows`）。区画ごとに行・トークン・見た目・条件を編む。
 * 保存の形と検証は client-core の `rowLayout.ts`（web と同じ）。変更は押した時点で `sidebarRows` を丸ごと送る（web の `setSidebarLayout`）。
 */
const AREA_LABEL: Record<SidebarArea, string> = {
  spaces: "spaces の行（workspace）",
  agents: "agents の行（エージェント）",
};
const WHEN_CHOICES: readonly { value: RuleWhen; label: string }[] = [
  { value: "equals", label: "と一致する" },
  { value: "contains", label: "を含む" },
  { value: "starts_with", label: "で始まる" },
  { value: "gt", label: "より大きい（数）" },
  { value: "lt", label: "より小さい（数）" },
];
const TRI = [
  { value: undefined, label: "既定" },
  { value: true, label: "入" },
  { value: false, label: "切" },
] as const;

export interface SidebarRowsEnv {
  prefs: PrefsModel;
  write: SettingsWriter;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const tokenLabel = (area: SidebarArea, token: string): string =>
  builtinToken(area, token)?.label ?? "独自トークン";
const triLabel = (v: boolean | undefined): string => (v === undefined ? "既定" : v ? "入" : "切");

function choose(
  title: string,
  ops: { label: string; run: () => Outcome; current?: boolean }[],
): Outcome {
  const options: ChoiceOption[] = ops.map((o) => ({
    label: o.label,
    ...(o.current ? { current: true } : {}),
  }));
  return { kind: "choose", title, options, pick: (i) => ops[i]!.run() };
}

/** 色の入力（`#RGB`・`#RRGGBB`。空は既定へ）。 */
function fgEdit(
  title: string,
  current: string | undefined,
  apply: (fg: string | undefined) => string,
): Outcome {
  return {
    kind: "edit",
    title: `${title}（#RGB・#RRGGBB。空で既定）`,
    initial: current ?? "",
    commit: (text) => {
      const raw = text.trim();
      if (raw === "") return apply(undefined);
      if (!isValidColor(raw))
        return `色は #RGB か #RRGGBB で入れてください（${raw} は読めません）。`;
      return apply(raw);
    },
  };
}

function setStyle(
  target: TokenStyle,
  key: "fg" | "bold" | "dim",
  v: string | boolean | undefined,
): void {
  const t = target as Record<string, unknown>;
  if (v === undefined) delete t[key];
  else t[key] = v;
}

function styleText(s: TokenStyle): string {
  const parts: string[] = [];
  if (s.fg) parts.push(s.fg);
  if (s.bold !== undefined) parts.push(s.bold ? "太字" : "太字でない");
  if (s.dim !== undefined) parts.push(s.dim ? "薄字" : "薄字でない");
  return parts.join("・");
}

function ruleText(r: TokenRule): string {
  const when = WHEN_CHOICES.find((w) => w.value === r.when)?.label ?? r.when;
  const style = styleText(r);
  const tail = [
    r.hide ? "隠す" : style,
    isTextWhen(r.when) && "ignoreCase" in r && r.ignoreCase ? "大小無視" : "",
  ]
    .filter((x) => x !== "")
    .join("・");
  return `値が ${JSON.stringify(r.value)} ${when}${tail ? ` → ${tail}` : ""}`;
}

export function sidebarRowsItems(env: SidebarRowsEnv): SettingItem[] {
  const saved = loadSidebarRows(env.prefs.shared.sidebarRows);
  const layoutOf = (area: SidebarArea): RowLayout => effectiveLayout(saved, area);
  const save = (area: SidebarArea, next: RowLayout | null): void =>
    env.write.setShared({ sidebarRows: serializeSidebarRows({ ...saved, [area]: next }) ?? null });
  /** 写しに当てて保存する（既定の並び〔`DEFAULT_LAYOUTS`〕を書き換えない）。 */
  const mutate = (area: SidebarArea, fn: (l: RowLayout) => void, message: string): string => {
    const next = clone(layoutOf(area));
    fn(next);
    save(area, next);
    return message;
  };

  const ruleOps = (area: SidebarArea, ri: number, ti: number, k: number): Outcome => {
    const rule = layoutOf(area)[ri]![ti]!.rules![k]!;
    const at = (l: RowLayout): TokenRule => l[ri]![ti]!.rules![k]!;
    const n = layoutOf(area)[ri]![ti]!.rules!.length;
    const ops: { label: string; run: () => Outcome }[] = [
      {
        label: `種類：${WHEN_CHOICES.find((w) => w.value === rule.when)?.label}`,
        run: () =>
          choose(
            "条件の種類",
            WHEN_CHOICES.map((w) => ({
              label: w.label,
              current: w.value === rule.when,
              run: () =>
                mutate(
                  area,
                  (l) => {
                    const rules = l[ri]![ti]!.rules!;
                    const prev = rules[k]!;
                    const style: TokenStyle & { hide?: boolean } = {};
                    for (const key of ["fg", "bold", "dim", "hide"] as const)
                      if (prev[key] !== undefined)
                        (style as Record<string, unknown>)[key] = prev[key];
                    // 文字と数をまたぐときは値を移せるときだけ移す（web と同じ）。
                    if (isTextWhen(w.value)) {
                      const next: TokenRule = {
                        ...style,
                        when: w.value,
                        value: String(prev.value),
                      };
                      if (isTextWhen(prev.when) && "ignoreCase" in prev && prev.ignoreCase)
                        next.ignoreCase = true;
                      rules[k] = next;
                    } else
                      rules[k] = {
                        ...style,
                        when: w.value as "gt" | "lt",
                        value:
                          typeof prev.value === "number"
                            ? prev.value
                            : (parseFiniteNumber(String(prev.value).trim()) ?? 0),
                      };
                  },
                  `条件 ${k + 1} を「${w.label}」にしました。`,
                ),
            })),
          ),
      },
      {
        label: `値：${JSON.stringify(rule.value)}`,
        run: () => ({
          kind: "edit",
          title: `条件 ${k + 1} の値`,
          initial: String(rule.value),
          commit: (raw) => {
            if (isTextWhen(rule.when)) {
              if (raw.length > MAX_RULE_TEXT) return `条件の文字は ${MAX_RULE_TEXT} 文字までです。`;
              return mutate(
                area,
                (l) => ((at(l) as { value: string }).value = raw),
                `条件 ${k + 1} の値を変えました。`,
              );
            }
            const v = parseFiniteNumber(raw.trim());
            if (v === null)
              return `数の条件には数を入れてください（${raw} は数として読めません）。`;
            return mutate(
              area,
              (l) => ((at(l) as { value: number }).value = v),
              `条件 ${k + 1} の値を変えました。`,
            );
          },
        }),
      },
    ];
    if (isTextWhen(rule.when)) {
      const ic = "ignoreCase" in rule && rule.ignoreCase === true;
      ops.push({
        label: `大文字小文字を区別しない（ASCII）：${ic ? "入" : "切"}`,
        run: () =>
          mutate(
            area,
            (l) => {
              const r = at(l) as unknown as Record<string, unknown>;
              if (ic) delete r["ignoreCase"];
              else r["ignoreCase"] = true;
            },
            `条件 ${k + 1} の大文字小文字の区別を変えました。`,
          ),
      });
    }
    ops.push(
      {
        label: `当たったら隠す：${rule.hide ? "入" : "切"}`,
        run: () =>
          mutate(
            area,
            (l) => {
              const r = at(l) as unknown as Record<string, unknown>;
              if (rule.hide) delete r["hide"];
              else r["hide"] = true;
            },
            `条件 ${k + 1} の「隠す」を変えました。`,
          ),
      },
      {
        label: `前景色：${rule.fg ?? "既定"}`,
        run: () =>
          fgEdit(`条件 ${k + 1} の色`, rule.fg, (fg) =>
            mutate(area, (l) => setStyle(at(l), "fg", fg), `条件 ${k + 1} の色を変えました。`),
          ),
      },
      ...(["bold", "dim"] as const).map((key) => ({
        label: `${key === "bold" ? "太字" : "薄字"}：${triLabel(rule[key])}`,
        run: () =>
          choose(
            key === "bold" ? "太字" : "薄字",
            TRI.map((t) => ({
              label: t.label,
              current: rule[key] === t.value,
              run: () =>
                mutate(area, (l) => setStyle(at(l), key, t.value), `条件 ${k + 1} を変えました。`),
            })),
          ),
      })),
    );
    if (k > 0)
      ops.push({
        label: "上へ",
        run: () =>
          mutate(
            area,
            (l) => {
              const rs = l[ri]![ti]!.rules!;
              [rs[k - 1], rs[k]] = [rs[k]!, rs[k - 1]!];
            },
            `条件 ${k + 1} を上へ動かしました。`,
          ),
      });
    if (k < n - 1)
      ops.push({
        label: "下へ",
        run: () =>
          mutate(
            area,
            (l) => {
              const rs = l[ri]![ti]!.rules!;
              [rs[k + 1], rs[k]] = [rs[k]!, rs[k + 1]!];
            },
            `条件 ${k + 1} を下へ動かしました。`,
          ),
      });
    ops.push({
      label: "削除",
      run: () =>
        mutate(
          area,
          (l) => {
            const t = l[ri]![ti]!;
            t.rules!.splice(k, 1);
            if (t.rules!.length === 0) delete t.rules;
          },
          `条件 ${k + 1} を消しました。`,
        ),
    });
    return choose(`条件 ${k + 1}：${ruleText(rule)}`, ops);
  };

  const tokenOps = (area: SidebarArea, ri: number, ti: number): Outcome => {
    const row = layoutOf(area)[ri]!;
    const spec = row[ti]!;
    const at = (l: RowLayout): TokenSpec => l[ri]![ti]!;
    const ops: { label: string; run: () => Outcome }[] = [
      {
        label: `前景色：${spec.fg ?? "既定"}`,
        run: () =>
          fgEdit(`${spec.token} の色`, spec.fg, (fg) =>
            mutate(area, (l) => setStyle(at(l), "fg", fg), `${spec.token} の色を変えました。`),
          ),
      },
      ...(["bold", "dim"] as const).map((key) => ({
        label: `${key === "bold" ? "太字" : "薄字"}：${triLabel(spec[key])}`,
        run: () =>
          choose(
            key === "bold" ? "太字" : "薄字",
            TRI.map((t) => ({
              label: t.label,
              current: spec[key] === t.value,
              run: () =>
                mutate(area, (l) => setStyle(at(l), key, t.value), `${spec.token} を変えました。`),
            })),
          ),
      })),
    ];
    if (isTextValued(area, spec.token)) {
      (spec.rules ?? []).forEach((r, k) =>
        ops.push({ label: `条件 ${k + 1}：${ruleText(r)}`, run: () => ruleOps(area, ri, ti, k) }),
      );
      if ((spec.rules?.length ?? 0) < MAX_RULES)
        ops.push({
          label: "条件を足す",
          run: () =>
            mutate(
              area,
              (l) => {
                const t = at(l);
                t.rules = [...(t.rules ?? []), { when: "equals", value: "" }];
              },
              `${spec.token} に条件を足しました（値を入れてください）。`,
            ),
        });
    }
    if (ti > 0)
      ops.push({
        label: "前へ",
        run: () =>
          mutate(
            area,
            (l) => {
              const r = l[ri]!;
              [r[ti - 1], r[ti]] = [r[ti]!, r[ti - 1]!];
            },
            `${spec.token} を前へ動かしました。`,
          ),
      });
    if (ti < row.length - 1)
      ops.push({
        label: "後へ",
        run: () =>
          mutate(
            area,
            (l) => {
              const r = l[ri]!;
              [r[ti + 1], r[ti]] = [r[ti]!, r[ti + 1]!];
            },
            `${spec.token} を後へ動かしました。`,
          ),
      });
    ops.push({
      label: "削除",
      run: () => mutate(area, (l) => l[ri]!.splice(ti, 1), `${spec.token} を消しました。`),
    });
    const note = isTextValued(area, spec.token) ? "" : "（このトークンには条件を付けられません）";
    return choose(`${tokenLabel(area, spec.token)}（${spec.token}）${note}`, ops);
  };

  const rowOps = (area: SidebarArea, ri: number): Outcome => {
    const layout = layoutOf(area);
    const row = layout[ri]!;
    const ops: { label: string; run: () => Outcome }[] = row.map((t, ti) => ({
      label: `${tokenLabel(area, t.token)}（${t.token}）${styleText(t) ? `：${styleText(t)}` : ""}${t.rules ? `・条件 ${t.rules.length}` : ""}`,
      run: () => tokenOps(area, ri, ti),
    }));
    if (row.length < MAX_TOKENS_PER_ROW)
      ops.push({
        label: "トークンを足す",
        run: () =>
          choose("足すトークン", [
            ...BUILTIN_TOKENS[area].map((b) => ({
              label: `${b.label}（${b.id}）`,
              run: () =>
                mutate(
                  area,
                  (l) => l[ri]!.push({ token: b.id }),
                  `「${b.label}」（${b.id}）を ${ri + 1} 行目に足しました。`,
                ),
            })),
            {
              label: "独自トークン（$名前）",
              run: () => ({
                kind: "edit",
                title: "独自トークンの名前（sodactl … report-metadata で付けた名前）",
                initial: "",
                commit: (text) => {
                  const raw = text.trim();
                  const token = raw.startsWith("$") ? raw : `$${raw}`;
                  if (!isValidCustomToken(token))
                    return `独自トークンの名前は英数字と _ - の 1〜${MAX_CUSTOM_NAME} 文字で入れてください（$ は付けなくてよい）。`;
                  return mutate(
                    area,
                    (l) => l[ri]!.push({ token }),
                    `「独自トークン」（${token}）を ${ri + 1} 行目に足しました。`,
                  );
                },
              }),
            },
          ]),
      });
    if (ri > 0)
      ops.push({
        label: "行を上へ",
        run: () =>
          mutate(
            area,
            (l) => {
              [l[ri - 1], l[ri]] = [l[ri]!, l[ri - 1]!];
            },
            `${ri + 1} 行目を上へ動かしました。`,
          ),
      });
    if (ri < layout.length - 1)
      ops.push({
        label: "行を下へ",
        run: () =>
          mutate(
            area,
            (l) => {
              [l[ri + 1], l[ri]] = [l[ri]!, l[ri + 1]!];
            },
            `${ri + 1} 行目を下へ動かしました。`,
          ),
      });
    ops.push({
      label: "行を削除",
      run: () => mutate(area, (l) => l.splice(ri, 1), `${ri + 1} 行目を消しました。`),
    });
    return choose(`${AREA_LABEL[area]}：${ri + 1} 行目`, ops);
  };

  const items: SettingItem[] = [{ label: "サイドバーの行（上級者向け）", heading: true }];
  for (const area of SIDEBAR_AREAS) {
    const layout = layoutOf(area);
    const isDefault = saved[area] === null;
    items.push({
      label: `  ${AREA_LABEL[area]}`,
      value: isDefault ? "既定" : `${layout.length} 行`,
      note: "行ごとに並べるトークン（状態の印・名前・ブランチ等と、sodactl で付けた独自トークン）と、その見た目・条件を選べます。",
      activate: () =>
        choose(AREA_LABEL[area], [
          ...(layout.length < MAX_ROWS
            ? [
                {
                  label: "行を足す",
                  run: (): Outcome =>
                    mutate(
                      area,
                      (l) => l.push([]),
                      `${layout.length + 1} 行目を足しました（トークンを足してください）。`,
                    ),
                },
              ]
            : []),
          ...(isDefault
            ? []
            : [
                {
                  label: "既定に戻す",
                  run: (): Outcome => ({
                    kind: "confirm",
                    title: `${AREA_LABEL[area]}を既定の並びへ戻しますか？（取り消せません）`,
                    yesLabel: "既定に戻す",
                    yes: () => {
                      save(area, null);
                      return `${AREA_LABEL[area]}を既定へ戻しました。`;
                    },
                  }),
                },
              ]),
        ]),
    });
    layout.forEach((row, ri) => {
      items.push({
        label: `    ${ri + 1} 行目`,
        value: row.length === 0 ? "（空）" : row.map((t) => t.token).join(" "),
        activate: () => rowOps(area, ri),
      });
    });
  }
  return items;
}
