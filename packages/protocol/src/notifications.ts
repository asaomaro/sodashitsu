import { z } from "zod";
export interface SharedNotice {
  paneId: string;
  key: string;
  status: "deferred" | "resolved";
  at: number;
}
export const NotificationUpdateParams = z.object({
  paneId: z.string().min(1),
  key: z.string().min(1).max(200),
  status: z.enum(["deferred", "resolved"]),
});
export const NotificationStateParams = z.object({});
export interface NotificationState {
  notices: SharedNotice[];
}
