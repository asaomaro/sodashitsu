import { z } from "zod";
const id = z.string().regex(/^[0-9a-f]{32}$/);
export const DelegationInviteParams = z.object({ label: z.string().min(1).max(128) });
export const DelegationStartParams = z.object({
  url: z.string().min(1).max(2048),
  machineId: id,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const DelegationStopParams = z.object({ id });
export interface DelegationInvitation {
  version: 1;
  url: string;
  machineId: string;
  token: string;
}
export interface DelegationStatus {
  id: string;
  url: string;
  state: "connecting" | "online" | "reconnecting" | "attention";
  message: string | null;
}
/** Only loopback permits cleartext. Credentials stay out of URL/query/process arguments. */
export function delegationUrl(input: string): string {
  const u = new URL(input);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !["/", "/machine-delegation"].includes(u.pathname)
  )
    throw new Error("接続先は資格情報・クエリ・パスを含まないサーバーURLにしてください");
  if (u.protocol === "https:") u.protocol = "wss:";
  if (u.protocol === "http:") u.protocol = "ws:";
  if (
    u.protocol !== "wss:" &&
    !(u.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
  )
    throw new Error("外部への委譲にはHTTPS/WSSが必要です");
  u.pathname = "/machine-delegation";
  if (u.href.length > 2048) throw new Error("接続先URLが長すぎます");
  return u.href;
}

export const PairingStartParams = z.object({
  url: z.string().min(1).max(2048),
  label: z.string().min(1).max(128),
});
export const PairingConfirmParams = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^\d{8}$/),
});
export const PairingRejectParams = z.object({ id: z.string().uuid() });
export interface PairingRequest {
  id: string;
  label: string;
  code: string;
  expiresAt: number;
  address: string;
}

export const MachineManageParams = z.object({
  id,
  action: z.enum(["enable", "disable", "remove"]),
});
export interface ManagedConnection {
  id: string;
  label: string;
  target: string;
  transport: "ssh" | "reverse";
  enabled: boolean;
  state: string;
  message: string | null;
}

/** SSH credentials remain managed by OpenSSH; only a target and display name are accepted. */
export const MachineAddParams = z
  .object({
    label: z.string().min(1).max(128),
    target: z.string().min(1).max(1024),
    session: z.string().min(1).max(128).optional(),
  })
  .strict();
