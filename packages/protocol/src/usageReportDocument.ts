import { z } from "zod";
const short = z.string().max(160),
  body = z.string().max(2400);
export const UsageReportDocument = z.object({
  summary: z.string().max(2400),
  work: z
    .array(
      z.object({
        agent: short,
        workspace: short.default(""),
        status: short.default(""),
        description: body,
        evidence: z.string().max(1200).default(""),
      }),
    )
    .max(12),
  patterns: z.array(z.object({ title: short, detail: body })).max(8),
  recommendations: z
    .array(z.object({ priority: z.enum(["high", "medium", "low"]), title: short, detail: body }))
    .max(8),
  limitations: z.array(z.string().max(1200)).max(12),
});
export type UsageReportDocument = z.infer<typeof UsageReportDocument>;
export interface UsageReportMetrics {
  tokens?: number;
  toolCalls?: number;
  subRatio?: number;
  cacheRatio?: number;
  costUsd?: number;
}
export function structuredReportDocument(text: string): UsageReportDocument | null {
  try {
    const result = UsageReportDocument.safeParse(
      JSON.parse(
        text
          .slice(0, 128 * 1024)
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      ),
    );
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function usageReportText(d: UsageReportDocument): string {
  const priority = { high: "優先度 高", medium: "優先度 中", low: "優先度 低" };
  return [
    d.summary,
    "現在の取り組み",
    ...d.work.flatMap((w) => [
      `${w.agent}${w.workspace ? " / " + w.workspace : ""}${w.status ? "（" + w.status + "）" : ""}`,
      w.description,
      ...(w.evidence ? ["根拠: " + w.evidence] : []),
    ]),
    "使われ方",
    ...d.patterns.flatMap((p) => [p.title, p.detail]),
    "改善案",
    ...d.recommendations.flatMap((r) => [`${priority[r.priority]}: ${r.title}`, r.detail]),
    "取得範囲と限界",
    ...d.limitations,
  ]
    .filter(Boolean)
    .join("\n\n");
}
/** Compatibility with text-only reports. All strings remain data, never executable HTML. */
export function reportDocument(text: string): UsageReportDocument {
  const input = text.slice(0, 128 * 1024).trim();
  const parsed = structuredReportDocument(input);
  if (parsed) return parsed;
  const sections = {
    work: [] as string[],
    patterns: [] as string[],
    recommendations: [] as string[],
    limitations: [] as string[],
    summary: [] as string[],
  };
  let current: keyof typeof sections = "summary";
  for (const raw of input.split("\n")) {
    const line = raw
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/\*\*/g, "")
      .trim();
    const heading = line.match(
      /^(?:\d+[.、)）]\s*)?(現在の取り組み|使われ方|利用状況|改善案|改善提案|取得範囲と限界|限界)[\s:：]*(.*)$/,
    );
    if (heading) {
      current =
        heading[1] === "現在の取り組み"
          ? "work"
          : heading[1] === "使われ方" || heading[1] === "利用状況"
            ? "patterns"
            : heading[1]?.startsWith("改善")
              ? "recommendations"
              : "limitations";
      if (heading[2]) sections[current].push(heading[2]);
    } else if (line) sections[current].push(line);
  }
  const joined = (key: keyof typeof sections) => sections[key].join("\n").slice(0, 2400);
  return {
    summary:
      joined("summary") ||
      (!Object.values(sections).some((v) => v.length) ? input.slice(0, 2400) : ""),
    work: sections.work.length
      ? [
          {
            agent: "取り組み",
            workspace: "",
            status: "",
            description: joined("work"),
            evidence: "",
          },
        ]
      : [],
    patterns: sections.patterns.length ? [{ title: "利用傾向", detail: joined("patterns") }] : [],
    recommendations: sections.recommendations.length
      ? [{ priority: "medium", title: "改善提案", detail: joined("recommendations") }]
      : [],
    limitations: sections.limitations.slice(0, 12).map((x) => x.slice(0, 1200)),
  };
}
