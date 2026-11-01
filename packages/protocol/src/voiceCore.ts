import {z} from "zod";
export const VoiceCoreCallParams=z.object({
 requestId:z.uuid().optional(),
 cancellable:z.boolean().optional(),
 operation:z.string().regex(/^[a-z_]+(?:\/[a-zA-Z0-9_.-]+)*$/).max(128),
 coreVersion:z.string().max(80).optional(),
 speaker:z.number().int().min(0).max(2147483647).optional(),
 text:z.string().optional(),
 params:z.record(z.string(),z.union([z.string(),z.number().finite(),z.boolean()])).optional(),
 body:z.unknown().optional(),method:z.enum(["GET","POST","PUT","DELETE"]).optional(),
}).strict();
export type VoiceCoreCall=z.infer<typeof VoiceCoreCallParams>;
export type VoiceCoreResult={kind:"json";value:unknown}|{kind:"bytes";mime:string;base64:string};

export const VoiceCoreCancelParams=z.object({requestId:z.uuid()}).strict();
