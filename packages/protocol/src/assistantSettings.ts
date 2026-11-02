import {z} from 'zod';
export const AssistantSettingsGetParams=z.object({}).strict();
export const AssistantSettingsSetParams=z.object({enabled:z.boolean()}).strict();
export const AssistantSetupProgress=z.object({
 stage:z.enum(['environment','cache','download','extract','verify','app','connect','ready']),
 startedAt:z.number().finite(),updatedAt:z.number().finite(),
 receivedBytes:z.number().int().nonnegative().optional(),totalBytes:z.number().int().positive().optional(),
});
export type AssistantSetupProgress=z.infer<typeof AssistantSetupProgress>;
export type AssistantSetupUpdate=Omit<AssistantSetupProgress,'startedAt'|'updatedAt'>;
export const AssistantSettingsResult=z.object({enabled:z.boolean(),canConfigure:z.boolean(),phase:z.enum(['disabled','preparing','starting','running','stopping','error']),message:z.string().max(1024),progress:AssistantSetupProgress.optional()}).strict();
export type AssistantSettingsResult=z.infer<typeof AssistantSettingsResult>;
