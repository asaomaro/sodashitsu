import {z} from "zod";
/** Sent only inside the authenticated viewer wire after signin feature opt-in. */
export const DesktopSigninRequired=z.object({type:z.literal("signin_required"),id:z.string().uuid(),allowInput:z.boolean(),validForMs:z.number().int().min(1).max(120000)}).strict();
export const DesktopSigninGrant=z.object({type:z.literal("signin_grant"),id:z.string().uuid(),control:z.boolean()}).strict();
