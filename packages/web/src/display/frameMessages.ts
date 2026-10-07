import { checkDisplayAction } from "@sodashitsu/protocol";

/** 枠から親へ、port で届く知らせ（`readFrameMessage` が検査して読む）。 */
export type FrameMessage =
  | { type: "rendered"; rev: number }
  | { type: "rejected"; rev: number }
  | { type: "action"; rev: number; action: string; data?: Record<string, string> }
  | { type: "key"; key: "escape" | "prefix" }
  | { type: "pong"; n: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const isRev = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** 枠からの知らせを検査して読む（純粋）。形が違えば `null`（捨てる）。 */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "rendered":
    case "rejected":
      return isRev(data.rev) ? { type: data.type, rev: data.rev } : null;
    case "action": {
      if (!isRev(data.rev)) return null;
      const checked = checkDisplayAction({ action: data.action, ...(data.data !== undefined ? { data: data.data } : {}) });
      if (!checked.ok) return null;
      return { type: "action", rev: data.rev, ...checked.value };
    }
    case "key":
      return data.key === "escape" || data.key === "prefix" ? { type: "key", key: data.key } : null;
    case "pong":
      return typeof data.n === "number" && Number.isInteger(data.n) ? { type: "pong", n: data.n } : null;
    default:
      return null;
  }
}
