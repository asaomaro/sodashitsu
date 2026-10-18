import { z } from "zod";
const safeLabel = z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f-\u009f]*$/);
export const ViewerKind = z.enum(["web-preview", "desktop", "vscode"]);
export const ViewerTab = z
  .object({
    id: z.string().uuid(),
    machineId: z.string().min(1).max(256),
    workspaceId: z.string().min(1).max(128),
    kind: ViewerKind,
    label: safeLabel,
  })
  .strict();
export type ViewerTab = z.infer<typeof ViewerTab>;
export const MAX_VIEWER_TABS = 128;
export function loadViewerTabs(raw: unknown): ViewerTab[] {
  const parsed = z.array(ViewerTab).max(MAX_VIEWER_TABS).safeParse(raw);
  if (!parsed.success) return [];
  const ids = new Set<string>();
  return parsed.data.filter((tab) => !ids.has(tab.id) && !!ids.add(tab.id));
}
export const VIEWER_LABELS = {
  "web-preview": "Webプレビュー",
  desktop: "デスクトップ",
  vscode: "VSCode",
} as const;
export const ViewerTabMethods = {
  "viewer_tabs.list": z.object({}).strict(),
  "viewer_tabs.create": ViewerTab.omit({ id: true }),
  "viewer_tabs.update": z
    .object({
      id: z.string().uuid(),
      label: safeLabel.optional(),
      position: z
        .number()
        .int()
        .min(0)
        .max(MAX_VIEWER_TABS - 1)
        .optional(),
    })
    .strict(),
  "viewer_tabs.remove": z.object({ id: z.string().uuid() }).strict(),
};
export interface ViewerTabResults {
  "viewer_tabs.list": { tabs: ViewerTab[]; rev: number };
  "viewer_tabs.create": { tabs: ViewerTab[]; tab: ViewerTab; rev: number };
  "viewer_tabs.update": { tabs: ViewerTab[]; rev: number };
  "viewer_tabs.remove": { tabs: ViewerTab[]; rev: number };
}
