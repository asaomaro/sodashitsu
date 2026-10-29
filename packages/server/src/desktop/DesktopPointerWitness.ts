import { z } from "zod";
/** Private physical-helper metadata. Never accepted from a viewer or relay ACK. */
export const DesktopPointerWitness = z
  .object({
    epoch: z.uuid(),
    x: z.number().int().min(-2147483648).max(2147483647),
    y: z.number().int().min(-2147483648).max(2147483647),
    window: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0),
    pid: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type DesktopPointerWitness = z.infer<typeof DesktopPointerWitness>;
export const DesktopHelperInputAck = z
  .object({
    type: z.literal("input_ack"),
    seq: z.number().int().positive().safe(),
    pointer: DesktopPointerWitness.optional(),
  })
  .strict();
