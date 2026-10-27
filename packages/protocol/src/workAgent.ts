import type {AskResult} from "./ask.js";
import { z } from "zod";
import { WorkKind, WorkFileRequest } from "./work.js";
import { normalizeAskSpec, ASK_SPEC_MAX_BYTES } from "./ask.js";
import { RpcError } from "./errors.js";
import { COMMAND_ID_RE } from "./commands.js";

export const WorkAgentTask = z.object({
  pluginKey: z.string().min(1).max(2048),
  taskFile: z.string().min(1).max(4096),
}).strict();
export const WorkAgentState = z.enum(["starting", "idle", "working", "blocked", "stopped"]);
const lease = { id: z.string().uuid(), claim: z.string().uuid() };
export const WorkAgentPlugin = z.discriminatedUnion("action", [
  z.object({ action: z.literal("operations") }).strict(),
  z.object({ action: z.literal("call"), name: z.string().regex(COMMAND_ID_RE), params: z.record(z.string(), z.unknown())
    .refine(v => new TextEncoder().encode(JSON.stringify(v)).length <= 65536) }).strict(),
]);

const entity = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const WorkAgentArgv = z.array(z.string().max(4096).refine(s => !/[\x00-\x1f\x7f]/.test(s))).max(64)
  .refine(a => a.reduce((n, s) => n + s.length, 0) <= 16000, "agent arguments are too long");
/** Only interactive options are forwarded; native tool/config/admin switches are not. */
export function workAgentArgumentError(kind: "claude" | "codex", args: readonly string[]): string | undefined {
  if (kind !== "claude" && kind !== "codex") return "work agent requires claude|codex";
  if (!WorkAgentArgv.safeParse(args).success) return "agent arguments are invalid or too long";
  const switches = new Set(kind === "claude"
    ? ["--continue", "-c", "--fork-session", "--verbose", "--disable-slash-commands", "--include-partial-messages", "--help", "-h", "--version", "-v"]
    : ["--last", "--all", "--no-alt-screen", "--search", "--help", "-h", "--version", "-V"]);
  const values = new Set(kind === "claude"
    ? ["--model", "--effort", "--fallback-model", "--output-format", "--input-format", "--max-turns", "--max-budget-usd", "--autocompact", "--name"]
    : ["--model", "-m"]);
  let subcommand = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!, equal = arg.indexOf("="), flag = equal < 0 ? arg : arg.slice(0, equal);
    if (switches.has(arg)) continue;
    if (kind === "codex" && (arg === "resume" || arg === "fork") && !subcommand) { subcommand = true; continue; }
    if (kind === "codex" && subcommand && /^[a-f0-9-]{36}$/i.test(arg)) continue;
    if (kind === "claude" && (flag === "--resume" || flag === "-r")) {
      if (equal >= 0) { if (!/^[a-f0-9-]{36}$/i.test(arg.slice(equal + 1))) return "resume requires a session UUID"; }
      else if (args[i + 1] && !args[i + 1]!.startsWith("-")) {
        if (!/^[a-f0-9-]{36}$/i.test(args[++i]!)) return "resume requires a session UUID";
      }
      continue;
    }
    if (values.has(flag)) {
      if (equal < 0 && (!args[i + 1] || args[i + 1]!.startsWith("-"))) return `missing value for ${flag}`;
      if (equal < 0) i++;
      continue;
    }
    if (kind === "codex" && (flag === "--config" || flag === "-c")) {
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (value && /^(?:model_reasoning_effort|model_verbosity)=(?:"(?:minimal|low|medium|high|xhigh|max|ultra)"|(?:minimal|low|medium|high|xhigh|max|ultra))$/.test(value)) continue;
    }
    return `unsupported work agent argument: ${flag}. Only interactive/resume/model options are allowed; enter the task after launch.`;
  }
  return undefined;
}
export const WorkAgentTool = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("transfer"), action: z.enum(["upload", "download"]), sourcePath: z.string().min(1).max(4096).refine(s => !s.includes("\0")), destinationPath: z.string().min(1).max(4096).refine(s => !s.includes("\0")) }).strict(),
  z.object({ operation: z.literal("transfer_chunk"), request: WorkFileRequest }).strict(),
  z.object({ operation: z.literal("plugin"), request: WorkAgentPlugin }).strict(),
  z.object({ operation: z.literal("inspect") }).strict(),
  z.object({ operation: z.literal("skill"), id: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1).max(4096).default("SKILL.md") }).strict(),
  z.object({ operation: z.literal("file"), action: z.enum(["list", "read", "write", "search"]), path: z.string().max(4096).default(""), query: z.string().max(4096).optional(), content: z.string().max(524288).optional(), version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ operation: z.literal("exec"), command: z.string().min(1).max(65536).refine(s => !s.includes("\0")), timeoutMs: z.number().int().min(1).max(300000).default(30000), encoding: z.enum(["utf-8", "shift_jis", "utf-16le"]).default("utf-8") }).strict(),
  z.object({ operation: z.literal("memory"), action: z.enum(["list", "read", "write"]), name: z.string().min(1).max(128).default("MEMORY.md"), content: z.string().max(262144).optional(), version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
]);
export type WorkAgentTool = z.infer<typeof WorkAgentTool>;
export interface WorkAgentRequest {
  id: string; paneId: string; workspaceId: string; folder: string; root: string; identity: string;
  agentKind: "claude" | "codex"; args: string[]; expiresAt: number;
  state: "pending" | "claimed" | "launched" | "failed" | "rejected";
  task?: z.infer<typeof WorkAgentTask>;
  terminalHere?:true;
}
export const WorkAgentRequestSchema = z.object({
  id: z.string().uuid(), paneId: entity, workspaceId: entity,
  folder: z.string().min(1).max(32768), root: z.string().min(1).max(32768), identity: z.string().regex(/^[a-f0-9]{64}$/),
  agentKind: WorkKind, args: WorkAgentArgv, expiresAt: z.number().int().positive(),
  state: z.enum(["pending", "claimed", "launched", "failed", "rejected"]),
  task: WorkAgentTask.optional(),terminalHere:z.literal(true).optional(),
}).strict();
export const WorkTerminalInput=z.object({seq:z.number().int().positive().safe(),data:z.string().min(1).max(43692).optional(),lease:z.string().uuid().optional(),cols:z.number().int().min(2).max(500).optional(),rows:z.number().int().min(2).max(300).optional()}).strict();
export const WorkTerminalOutput=z.object({seq:z.number().int().positive().safe(),data:z.string().min(1).max(43692),snapshot:z.literal(true).optional()}).strict();
export const WorkAgentMethods = {
  "work.agent_terminal_ask_start":z.object({...lease,params:z.unknown()}).strict(),
  "work.agent_terminal_ask_read":z.object({...lease,questionId:z.string().uuid()}).strict(),
  "work.agent_terminal_open":z.object(lease).strict(),
  "work.agent_terminal_end":z.object(lease).strict(),
  "work.agent_terminal_exchange":z.object({...lease,epoch:z.string().uuid(),ack:z.number().int().nonnegative().safe(),output:WorkTerminalOutput.optional()}).strict(),
  "work.agent_terminal_read":z.object({id:z.string().uuid(),epoch:z.string().uuid().optional(),ack:z.number().int().nonnegative().safe(),input:WorkTerminalInput.optional()}).strict(),
  "work.agent_terminal_close":z.object({id:z.string().uuid()}).strict(),
  "work.agent_request": z.object({ paneId: entity, agentKind: WorkKind, args: WorkAgentArgv,terminalHere:z.literal(true).optional() }).strict(),
  "work.agent_requests": z.object({ paneId: entity.optional() }).strict(),
  "work.agent_claim": z.object({ id: z.string().uuid() }).strict(),
  "work.agent_finish": z.object({ id: z.string().uuid(), claim: z.string().uuid(), state: z.enum(["launched", "failed"]) }).strict(),
  "work.agent_reject": z.object({ id: z.string().uuid() }).strict(),
  "work.agent_launch": z.object({ machineId: z.string().regex(/^[a-f0-9]{32}$/), requestId: z.string().uuid() }).strict(),
  "work.agent_poll": z.object({ ...lease, paneId: entity, state: WorkAgentState }).strict(),
  "work.agent_instruction_result": z.object({ ...lease, instructionId: z.string().uuid(), state: z.enum(["sent", "failed"]), message: z.string().max(500).optional() }).strict(),
  "work.agent_plugin": z.object({ ...lease, request: WorkAgentPlugin }).strict(),
  "work.agent_check": z.object(lease).strict(),
  "work.agent_tool": z.object({...lease,tool:WorkAgentTool}).strict(),
} as const;
export interface WorkAgentResults {
  "work.agent_terminal_ask_start":{questionId:string};
  "work.agent_terminal_ask_read":{state:"pending"}|{state:"failed"}|{state:"done";result:AskResult};
  "work.agent_terminal_open":{epoch:string};
  "work.agent_terminal_end":{};
  "work.agent_terminal_exchange":{epoch:string;input:((z.infer<typeof WorkTerminalInput>&{expiresInMs:number})|{seq:number;discarded:true})[];outputAck:number};
  "work.agent_terminal_read":{state:"waiting"}|{state:"closed";reason:string}|{state:"open";epoch:string;output:z.infer<typeof WorkTerminalOutput>[];inputAck:number;inputLease:string;connected:boolean};
  "work.agent_terminal_close":{};
  "work.agent_request": WorkAgentRequest;
  "work.agent_requests": { requests: WorkAgentRequest[] };
  "work.agent_claim": { request: WorkAgentRequest; claim: string };
  "work.agent_finish": {};
  "work.agent_reject": {};
  "work.agent_launch": { workspaceId: string; tabId: string; paneId: string };
  "work.agent_poll": { instruction?: { id: string; taskFile: string } };
  "work.agent_instruction_result": {};
  "work.agent_plugin": unknown;
  "work.agent_check": {};
  "work.agent_tool": unknown;
}


/** Local UI only. Never accepts a target pane, local file path, or external media URL. */
export const WorkAgentAskParams = z.object({
  spec: z.unknown(),
  documents: z.array(z.object({ title: z.string().min(1).max(500), markdown: z.string().max(131072) }).strict()).max(8).default([]),
  timeoutMs: z.number().int().min(1000).max(300000).default(300000),
}).strict();
export function checkWorkAgentAsk(raw: unknown) {
  const p = WorkAgentAskParams.parse(raw);
  if (new TextEncoder().encode(JSON.stringify(p)).length > ASK_SPEC_MAX_BYTES)
    throw new RpcError("invalid_ask_spec", "質問と添付本文は合計256KiBまでです");
  const checked = normalizeAskSpec(p.spec);
  if (!checked.ok) throw new RpcError("invalid_ask_spec", checked.message);
  if ((checked.spec.view?.length ?? 0) + p.documents.length > 8)
    throw new RpcError("invalid_ask_spec", "資料は合計8件までです");
  if (checked.spec.view?.some(v => v.file !== undefined) || checked.spec.questions.some(q => q.options.some(o => o.image !== undefined || o.audio !== undefined)))
    throw new RpcError("invalid_ask_spec", "操作元への質問には本文だけを渡してください。ローカルファイルや画像・音声参照は指定できません");
  return { ...p, spec: p.spec as Record<string, unknown>, view: checked.spec.view ?? [] };
}
