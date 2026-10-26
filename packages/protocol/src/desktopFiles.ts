import { z } from "zod";
import { WorkFileRequest } from "./work.js";
export const DESKTOP_FILES_PROTOCOL = "soda-desktop-files-v1";
const path = z
  .string()
  .max(4096)
  .refine((v) => !v.includes("\0"));
export const DesktopFileRequest = z
  .object({
    type: z.literal("desktop_file"),
    id: z.string().uuid(),
    request: z.union([
      z.object({ action: z.literal("grant"), enabled: z.boolean() }).strict(),
      z.object({ action: z.literal("list"), path }).strict(),
      WorkFileRequest,
    ]),
  })
  .strict();
export type DesktopFileRequest = z.infer<typeof DesktopFileRequest>;
export const DesktopFileResult = z
  .object({
    type: z.literal("desktop_file_result"),
    id: z.string().uuid(),
    ok: z.boolean(),
    message: z.string().max(500).optional(),
    result: z
      .object({
        id: z.string().uuid().optional(),
        bytes: z.number().int().min(0).max(104857600).optional(),
        offset: z.number().int().min(0).max(104857600).optional(),
        data: z.string().max(87384).optional(),
        done: z.boolean().optional(),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        destination: path.optional(),
        enabled: z.boolean().optional(),
        root: path.optional(),
        entries: z
          .array(
            z
              .object({
                name: z.string().max(255),
                directory: z.boolean(),
                bytes: z.number().min(0),
              })
              .strict(),
          )
          .max(500)
          .optional(),
        truncated: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DesktopFileResult = z.infer<typeof DesktopFileResult>;
