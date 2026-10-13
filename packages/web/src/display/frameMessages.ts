import { readComponentRect, type TerminalComponent } from "./components.js";
import { checkDisplayAction } from "@sodashitsu/protocol";

/** 枠から親へ、port で届く知らせ（`readFrameMessage` が検査して読む）。 */
export type FrameMessage =
  | ({ type: "component"; rev: number; component: "terminal" } & TerminalComponent)
  | { type: "component-remove"; rev: number; id: string }
  | { type: "rendered"; rev: number }
  | { type: "rejected"; rev: number }
  | { type: "failed"; rev: number }
  | { type: "action"; rev: number; action: string; data?: Record<string, string> }
  | { type: "key"; key: "escape" | "prefix" }
  | { type: "pong"; n: number }
  /** 静的な枠だけ: よその窓（兄弟の枠のスクリプトなど）からフォーカスが来た（利用者が入ったのではない）。親が元の場所へ戻す。 */
  | { type: "foreign-focus" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const isRev = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** 枠からの知らせを検査して読む（純粋）。形が違えば `null`（捨てる）。 */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "component-remove":
      return isRev(data.rev) && typeof data.id === "string" && /^[0-9]{1,10}$/.test(data.id) ? { type: data.type, rev: data.rev, id: data.id } : null;
    case "component": {
      const rect = readComponentRect(data.rect), clip = readComponentRect(data.clip);
      if (!isRev(data.rev) || data.component !== "terminal" || typeof data.id !== "string" || !/^[0-9]{1,10}$/.test(data.id) || typeof data.paneId !== "string" || data.paneId.length > 64 || !rect || !clip) return null;
      return { type: data.type, rev: data.rev, component: "terminal", id: data.id, paneId: data.paneId, rect, clip };
    }
    case "rendered":
    case "rejected":
    case "failed":
      return isRev(data.rev) ? { type: data.type, rev: data.rev } : null;
    case "action": {
      if (!isRev(data.rev)) return null;
      const checked = checkDisplayAction({ action: data.action, ...(data.data !== undefined ? { data: data.data } : {}) });
      if (!checked.ok) return null;
      return { type: "action", rev: data.rev, ...checked.value };
    }
    case "key":
      return data.key === "escape" || data.key === "prefix" ? { type: "key", key: data.key } : null;
    case "foreign-focus":
      return { type: "foreign-focus" };
    case "pong":
      return typeof data.n === "number" && Number.isInteger(data.n) ? { type: "pong", n: data.n } : null;
    default:
      return null;
  }
}
