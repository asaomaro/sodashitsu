import { z } from "zod";
export const DESKTOP_SHARED_CLIPBOARD_PROTOCOL="soda-desktop-shared-clipboard-v1";
export const DesktopSharedClipboardFailure=z.object({type:z.literal("shared_clipboard_failure"),code:z.literal("helper_incompatible")}).strict();
export const DESKTOP_RICH_CLIPBOARD_PROTOCOL = "soda-desktop-rich-clipboard-v1";
export const DESKTOP_CLIPBOARD_CHUNK_BYTES = 16 * 1024;
export const DESKTOP_CLIPBOARD_BUNDLE_BYTES = 4 * 1024 * 1024;
export const DESKTOP_CLIPBOARD_TEXT_BYTES = 512 * 1024;
export const DESKTOP_CLIPBOARD_PNG_BYTES = 2 * 1024 * 1024;
export const DESKTOP_CLIPBOARD_MARKUP_BYTES = 512 * 1024;
const encode = new TextEncoder();
function validRtf(value: string) {
  try {
    const raw = atob(value);
    return (
      raw.startsWith("{\\rtf") &&
      /\}[\t\r\n ]*$/.test(raw) &&
      raw.length <= DESKTOP_CLIPBOARD_MARKUP_BYTES &&
      btoa(raw) === value
    );
  } catch {
    return false;
  }
}
export const DesktopClipboardBundle = z
  .object({
    text: z
      .string()
      .max(DESKTOP_CLIPBOARD_TEXT_BYTES)
      .refine((s) => !s.includes("\0") && encode.encode(s).length <= DESKTOP_CLIPBOARD_TEXT_BYTES)
      .optional(),
    html: z
      .string()
      .refine((s) => !s.includes("\0") && encode.encode(s).length <= DESKTOP_CLIPBOARD_MARKUP_BYTES)
      .optional(),
    rtf: z
      .string()
      .max(Math.ceil(DESKTOP_CLIPBOARD_MARKUP_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
      .refine(validRtf)
      .optional(),
    png: z
      .string()
      .min(44)
      .max(Math.ceil(DESKTOP_CLIPBOARD_PNG_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export type DesktopClipboardBundle = z.infer<typeof DesktopClipboardBundle>;
export function clipboardPngSize(bytes: Uint8Array) {
  if (
    bytes.length < 33 ||
    bytes.length > DESKTOP_CLIPBOARD_PNG_BYTES ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) !== 13 ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
  )
    throw Error("Clipboard PNG format");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8_000_000)
    throw Error("Clipboard PNG dimensions");
  return { width, height };
}
function validateBundle(value: unknown): DesktopClipboardBundle {
  const bundle = DesktopClipboardBundle.parse(value);
  if (bundle.png) {
    const raw = atob(bundle.png);
    clipboardPngSize(Uint8Array.from(raw, (c) => c.charCodeAt(0)));
  }
  return bundle;
}
export function encodeClipboardBundle(value: unknown): Uint8Array {
  const bundle = validateBundle(value),
    bytes = encode.encode(JSON.stringify(bundle));
  if (bytes.length > DESKTOP_CLIPBOARD_BUNDLE_BYTES) throw Error("Clipboard bundle limit");
  return bytes;
}
export function decodeClipboardBundle(bytes: Uint8Array): DesktopClipboardBundle {
  if (!bytes.length || bytes.length > DESKTOP_CLIPBOARD_BUNDLE_BYTES)
    throw Error("Clipboard bundle limit");
  return validateBundle(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
const base = { type: z.literal("clipboard_rich"), id: z.string().uuid() };
const size = z.number().int().min(1).max(DESKTOP_CLIPBOARD_BUNDLE_BYTES);
const offset = z.number().int().min(0).max(DESKTOP_CLIPBOARD_BUNDLE_BYTES);
const chunk = z
  .string()
  .min(4)
  .max(Math.ceil(DESKTOP_CLIPBOARD_CHUNK_BYTES / 3) * 4)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  .refine((value) => {
    try {
      const raw = atob(value);
      return raw.length > 0 && raw.length <= DESKTOP_CLIPBOARD_CHUNK_BYTES && btoa(raw) === value;
    } catch {
      return false;
    }
  });
export const DesktopRichClipboardRequest = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("read") }).strict(),
  z.object({ ...base, operation: z.literal("begin"), size }).strict(),
  z
    .object({
      ...base,
      operation: z.literal("push"),
      offset,
      data: chunk,
    })
    .strict(),
  z.object({ ...base, operation: z.literal("pull"), offset }).strict(),
  z.object({ ...base, operation: z.literal("commit") }).strict(),
  z.object({ ...base, operation: z.literal("cancel") }).strict(),
]);
export type DesktopRichClipboardRequest = z.infer<typeof DesktopRichClipboardRequest>;
export const DesktopRichClipboardResult = z
  .object({
    type: z.literal("clipboard_rich_result"),
    id: z.string().uuid(),
    ok: z.boolean(),
    stage: z.enum(["begin", "chunk", "done", "cancelled"]),
    size: size.optional(),
    offset: offset.optional(),
    data: chunk.optional(),
  })
  .strict();
export type DesktopRichClipboardResult = z.infer<typeof DesktopRichClipboardResult>;
