import { z } from "zod";
export const DESKTOP_FOLDERS_PROTOCOL = "soda-desktop-folders-v1";
export const DESKTOP_FOLDER_MAX_ENTRIES = 1000;
export const DESKTOP_FOLDER_MAX_BYTES = 104857600;
export function desktopFolderPart(value: string): boolean {
  return (
    !!value &&
    new TextEncoder().encode(value).length <= 255 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/:*?"<>|\x00-\x1f]/u.test(value) &&
    !/[. ]$/u.test(value) &&
    !/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu.test(value) &&
    !value.startsWith(".soda-transfer-") &&
    !value.startsWith(".soda-folder-")
  );
}
export const DesktopFolderName = z
  .string()
  .refine(desktopFolderPart, "使えないフォルダ・ファイル名です");
export const DesktopFolderPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (v) => v.split("/").length <= 32 && v.split("/").every(desktopFolderPart),
    "フォルダ内の安全な相対パスを指定してください",
  );
const Entry = z.discriminatedUnion("directory", [
  z.object({ path: DesktopFolderPath, directory: z.literal(true) }).strict(),
  z
    .object({
      path: DesktopFolderPath,
      directory: z.literal(false),
      bytes: z.number().int().min(0).max(DESKTOP_FOLDER_MAX_BYTES),
    })
    .strict(),
]);
export const DesktopFolderManifest = z
  .array(Entry)
  .max(DESKTOP_FOLDER_MAX_ENTRIES)
  .superRefine((entries, ctx) => {
    let total = 0;
    const seen = new Map<string, boolean>(),
      exact = new Map<string, boolean>(),
      key = (s: string) => s.normalize("NFC").toUpperCase();
    for (const entry of entries) {
      if (seen.has(key(entry.path)))
        ctx.addIssue({ code: "custom", message: "名前が重複しています" });
      seen.set(key(entry.path), entry.directory);
      exact.set(entry.path, entry.directory);
      if (!entry.directory) total += entry.bytes;
    }
    if (
      total > DESKTOP_FOLDER_MAX_BYTES ||
      new TextEncoder().encode(JSON.stringify(entries)).length > 48000
    )
      ctx.addIssue({ code: "custom", message: "フォルダの容量か項目数が上限を超えています" });
    for (const entry of entries) {
      const parts = entry.path.split("/");
      parts.pop();
      while (parts.length) {
        if (exact.get(parts.join("/")) !== true)
          ctx.addIssue({ code: "custom", message: "親フォルダがありません" });
        parts.pop();
      }
    }
  });
export type DesktopFolderEntry = z.infer<typeof Entry>;
export type DesktopFolderManifest = z.infer<typeof DesktopFolderManifest>;
const id = z.string().uuid(),
  offset = z.number().int().min(0).max(DESKTOP_FOLDER_MAX_BYTES),
  path = z
    .string()
    .max(4096)
    .refine((v) => !v.includes("\0"));
export const DesktopFolderRequest = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("folder_upload_start"),
      id,
      parent: path,
      name: DesktopFolderName,
      entries: DesktopFolderManifest,
    })
    .strict(),
  z.object({ action: z.literal("folder_download_start"), id, path: DesktopFolderPath }).strict(),
  z
    .object({
      action: z.literal("folder_write"),
      id,
      path: DesktopFolderPath,
      offset,
      data: z.string().max(87384),
    })
    .strict(),
  z
    .object({
      action: z.literal("folder_file_finish"),
      id,
      path: DesktopFolderPath,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("folder_read"), id, offset }).strict(),
  z.object({ action: z.literal("folder_finish"), id }).strict(),
  z.object({ action: z.literal("folder_status"), id }).strict(),
  z.object({ action: z.literal("folder_abort"), id }).strict(),
]);
export type DesktopFolderRequest = z.infer<typeof DesktopFolderRequest>;

const checkpoint = z.string().regex(/^[a-f0-9]{64}$/);
export const DesktopFolderCheckpointRequest = z.union([
  z
    .object({ action: z.literal("folder_resume_start"), request: DesktopFolderRequest })
    .strict()
    .refine(
      (p) =>
        p.request.action === "folder_upload_start" || p.request.action === "folder_download_start",
    ),
  z.object({ action: z.literal("folder_resume_attach"), checkpoint, offset }).strict(),
  z
    .object({ action: z.literal("folder_resume_run"), checkpoint, request: DesktopFolderRequest })
    .strict()
    .refine(
      (p) =>
        !["folder_upload_start", "folder_download_start", "folder_abort"].includes(
          p.request.action,
        ),
    ),
  z.object({ action: z.literal("folder_resume_abort"), checkpoint }).strict(),
]);
export type DesktopFolderCheckpointRequest = z.infer<typeof DesktopFolderCheckpointRequest>;
