import {z} from 'zod';
export const AssistantSettingsGetParams=z.object({}).strict();
export const AssistantSettingsSetParams=z.object({enabled:z.boolean()}).strict();
export const AssistantSettingsResult=z.object({enabled:z.boolean(),canConfigure:z.boolean(),phase:z.enum(['disabled','preparing','starting','running','stopping','error']),message:z.string().max(1024)}).strict();
export type AssistantSettingsResult=z.infer<typeof AssistantSettingsResult>;
