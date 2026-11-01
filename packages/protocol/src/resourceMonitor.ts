import { z } from "zod";
import type { SystemResources } from "./systemFooter.js";
export const ResourceAppReportParams = z.object({
  deviceId:z.uuid(),
  hostId:z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  platform:z.enum(["win32","darwin","linux"]),
  processes:z.array(z.object({
    pid:z.number().int().positive(),
    startIdentity:z.string().max(120).nullable().default(null),
    startedAt:z.number().finite().nonnegative(),
    name:z.string().min(1).max(120),
    cpuPercent:z.number().finite().min(0).max(100000).nullable(),
    rssBytes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }).strict()).max(64),
}).strict();
export interface ResourceProcess {
  id:string;startIdentity:string|null;pid:number;parentPid:number|null;name:string;
  group:"server"|"agent"|"terminal"|"service"|"app";
  label:string;source:string;platform:string;
  paneId?:string;cpuPercent:number|null;rssBytes:number|null;threads:number|null;
}
export interface ResourceMonitorSnapshot {
  sampledAt:number;system:SystemResources;processes:ResourceProcess[];warnings:string[];
}
