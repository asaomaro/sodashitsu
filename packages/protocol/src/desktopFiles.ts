import {DesktopFolderRequest,DesktopFolderCheckpointRequest,DesktopFolderPath} from "./desktopFolders.js";
import { z } from "zod";
import { WorkFileRequest } from "./work.js";
export const DESKTOP_FILES_PROTOCOL = "soda-desktop-files-v1";
export const DESKTOP_FILE_CHECKPOINTS_PROTOCOL = "soda-desktop-file-checkpoints-v1";
const checkpoint = z.string().regex(/^[a-f0-9]{64}$/);
const offset = z.number().int().min(0).max(104857600);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const path = z
  .string()
  .max(4096)
  .refine((v) => !v.includes("\0"));
export const DesktopCheckpointRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkpoint_upload"), path, bytes: offset, sha256 }).strict(),
  z.object({ action: z.literal("checkpoint_download"), path }).strict(),
  z.object({ action: z.literal("checkpoint_attach"), checkpoint, offset }).strict(),
  z
    .object({
      action: z.literal("checkpoint_write"),
      checkpoint,
      offset,
      data: z.string().max(87384),
    })
    .strict(),
  z.object({ action: z.literal("checkpoint_read"), checkpoint, offset }).strict(),
  z.object({ action: z.literal("checkpoint_finish"), checkpoint }).strict(),
  z.object({ action: z.literal("checkpoint_status"), checkpoint }).strict(),
  z.object({ action: z.literal("checkpoint_abort"), checkpoint }).strict(),
]);
export type DesktopCheckpointRequest = z.infer<typeof DesktopCheckpointRequest>;
export const DesktopFileRequest = z
  .object({
    type: z.literal("desktop_file"),
    id: z.string().uuid(),
    request: z.union([
      z.object({ action: z.literal("grant"), enabled: z.boolean() }).strict(),
      z.object({ action: z.literal("list"), path }).strict(),
      WorkFileRequest,
      DesktopCheckpointRequest,
      DesktopFolderRequest,
      DesktopFolderCheckpointRequest,
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
        checkpoint: checkpoint.optional(),
        folderFiles:z.array(z.object({path:DesktopFolderPath,offset,done:z.boolean()}).strict()).max(1000).optional(),
        entriesDone:z.number().int().min(0).max(1000).optional(),
        expiresInMs: z.number().int().min(1).max(900000).optional(),
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
