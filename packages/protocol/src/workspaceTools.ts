import { z } from "zod";
export const BUILTIN_WORKSPACE_KEY = "builtin:workspace";
export const BUILTIN_DEVELOPMENT_DISPLAY = "workspace-development";
export const BUILTIN_VIEWS = [
  {
    id: "files",
    title: "ファイルツリー",
    targets: ["tab"],
    web: { renderer: "workspace" },
    terminal: { format: "text" },
    placements: ["left", "right", "float", "band-top", "band-bottom"],
  },
  {
    id: "file",
    title: "ファイル表示・編集",
    targets: ["tab"],
    web: { renderer: "workspace" },
    terminal: { format: "text" },
    placements: ["right", "left", "bottom", "float", "band-top", "band-bottom"],
  },
  {
    id: "git-graph",
    title: "Gitグラフ",
    targets: ["tab"],
    web: { renderer: "workspace" },
    terminal: { format: "text" },
    placements: ["bottom", "right", "float", "band-top", "band-bottom"],
  },
  {
    id: "git-diff",
    title: "Git差分",
    targets: ["tab"],
    web: { renderer: "workspace" },
    terminal: { format: "text" },
    placements: ["right", "bottom", "float", "band-top", "band-bottom"],
  },
] as const;
export const BUILTIN_WEB_VIEWS = BUILTIN_VIEWS.map((v) => ({ ...v, renderer: v.web.renderer }));
export const BUILTIN_TERMINAL_VIEWS = BUILTIN_VIEWS.map((v) => ({
  ...v,
  renderer: v.terminal.format,
}));
export type BuiltinViewId = (typeof BUILTIN_VIEWS)[number]["id"] | "development" | "statusline";
export const WorkspaceToolsParams = z.object({
  // 保存済みの旧IDも他のworkspace RPCと同様に受け付ける。
  workspaceId: z.string().min(1),
  operation: z.enum(["list", "read", "write", "git-log", "git-status", "git-diff", "search"]),
  path: z.string().max(4096).default(""),
  expectedFolder: z.string().max(4096).optional(),
  expectedRoot: z.string().max(32768).optional(),
  expectedIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  content: z
    .string()
    .max(512 * 1024)
    .optional(),
  version: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  query: z.string().min(1).max(256).optional(),
  grep: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  staged: z.boolean().optional(),
  commit: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
});
export type WorkspaceToolsParams = z.infer<typeof WorkspaceToolsParams>;
export interface WorkspaceToolsResult {
  matches?: { path: string; line?: number; text?: string }[];
  truncated?: boolean;
  path?: string;
  entries?: { name: string; path: string; directory: boolean; link: boolean }[];
  text?: string;
  version?: string;
  files?: { path: string; status: string }[];
}
