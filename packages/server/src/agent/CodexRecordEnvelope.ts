/** Constant-space JSON syntax/envelope validation for a Codex line too large to retain.
 * Discriminators must occur within the first 4KiB; payload text is never retained.
 * Only positively identified non-lifecycle envelopes may be discarded. */
type Context = "root" | "payload" | "item" | "other";
type Frame = { kind: "object" | "array"; phase: string; context: Context; key?: string; seen?: Set<string> };
// Codex rust-v0.166.0 protocol EventMsg: text/usage events, separate from ItemCompleted.
const NON_CHILD_EVENTS = new Set(["user_message", "agent_message", "token_count"]);
const NON_CHILD_ITEMS = new Set(["Extension", "AgentMessage", "UserMessage", "CommandExecution", "Reasoning", "ImageView", "FileChange", "McpToolCall", "ContextCompaction"]);
export class CodexRecordEnvelope {
  constructor(private readonly purpose: "subagents" | "turn" = "subagents") {}
  private turnTimestamp?: string;
  private turnModel?: string;
  private turnEffort?: string;
  private oversizedTurnCandidate=false;
  get recordType(): string | undefined { return this.rootType; }
  get turnMetadata(): { timestamp?: string; model?: string; effort?: string } {
    return {...(this.turnTimestamp!==undefined?{timestamp:this.turnTimestamp}:{}),...(this.turnModel!==undefined?{model:this.turnModel}:{}),...(this.turnEffort!==undefined?{effort:this.turnEffort}:{})};
  }
  private stack: Frame[] = [];
  private readonly utf8 = new TextDecoder("utf-8", { fatal: true });
  private mode: "idle" | "string" | "scalar" = "idle";
  private token = "";
  private capture = false;
  private keyToken = false;
  private escaped = false;
  private unicode = 0;
  private bytes = 0;
  private ended = false;
  private started = false;
  private bad = false;
  private rootType?: string;
  private payloadType?: string;
  private itemType?: string;
  get irrelevant(): boolean {
    return !this.bad && (this.rootType === "response_item" || this.rootType === "compacted" ||
      this.rootType === "event_msg" && (NON_CHILD_EVENTS.has(this.payloadType ?? "") || this.payloadType === "item_completed" && !!this.itemType && NON_CHILD_ITEMS.has(this.itemType)));
  }
  feed(bytes: Uint8Array): boolean {
    try { this.utf8.decode(bytes, { stream: true }); } catch { this.bad = true; return false; }
    for (const b of bytes) {
      if (this.bad) return false;
      this.bytes++;
      const c = String.fromCharCode(b);
      if (this.mode === "string") {
        if (this.capture) { if (this.token.length >= 768) { if(this.purpose==="turn"&&!this.keyToken&&this.stack.at(-1)?.context==="payload"&&["model","effort"].includes(this.stack.at(-1)?.key??"")){this.oversizedTurnCandidate=true;this.capture=false;this.token="";}else{this.bad = true; return false;} } this.token += c; }
        if (this.unicode) { if (!/[0-9a-fA-F]/.test(c)) this.bad = true; else this.unicode--; continue; }
        if (this.escaped) { this.escaped = false; if (c === "u") this.unicode = 4; else if (!'"\\/bfnrt'.includes(c)) this.bad = true; continue; }
        if (b < 32) { this.bad = true; continue; }
        if (c === "\\") { this.escaped = true; continue; }
        if (c === '"') this.endString();
        continue;
      }
      if (this.mode === "scalar") {
        if (!/[\s,}\]]/.test(c)) { if (this.token.length >= 64) this.bad = true; else this.token += c; continue; }
        this.endScalar();
        if (this.bad) return false;
      }
      if (c === " " || c === "\t" || c === "\r") continue;
      if (this.ended) { this.bad = true; continue; }
      const frame = this.stack.at(-1);
      if (frame?.kind === "object" && (frame.phase === "keyOrEnd" || frame.phase === "key")) {
        if (c === "}" && frame.phase === "keyOrEnd") { this.close("object"); continue; }
        if (c !== '"') { this.bad = true; continue; }
        this.startString(true, frame.context !== "other"); continue;
      }
      if (frame?.phase === "colon") { if (c !== ":") this.bad = true; else frame.phase = "value"; continue; }
      if (frame?.phase === "commaOrEnd") {
        if (c === (frame.kind === "object" ? "}" : "]")) { this.close(frame.kind); continue; }
        if (c !== ",") { this.bad = true; continue; }
        frame.phase = frame.kind === "object" ? "key" : "value"; continue;
      }
      if (frame?.kind === "array" && frame.phase === "valueOrEnd" && c === "]") { this.close("array"); continue; }
      if (!frame && this.started) { this.bad = true; continue; }
      if (!frame && c !== "{") { this.bad = true; continue; }
      if (c === "{" || c === "[") {
        if (this.stack.length >= 64) { this.bad = true; continue; }
        const context: Context = !frame ? "root" : frame.kind === "object" && frame.context === "root" && frame.key === "payload" && c === "{" ? "payload" : frame.kind === "object" && frame.context === "payload" && frame.key === "item" && c === "{" ? "item" : "other";
        // A discriminator must be a scalar string; nested objects cannot redefine it.
        if (this.importantType(frame)) { this.bad = true; continue; }
        this.started = true; this.stack.push({ kind: c === "{" ? "object" : "array", phase: c === "{" ? "keyOrEnd" : "valueOrEnd", context, ...(context !== "other" ? { seen: new Set<string>() } : {}) }); continue;
      }
      if (c === '"') { this.startString(false, frame?.context !== "other" && (this.importantType(frame) || this.purpose === "turn" && (frame?.context === "root" && frame.key === "timestamp" || (this.rootType === undefined || this.rootType === "turn_context") && frame?.context === "payload" && ["model", "effort"].includes(frame.key ?? "")))); continue; }
      if (this.importantType(frame)) { this.bad = true; continue; }
      this.mode = "scalar"; this.token = c;
    }
    return !this.bad;
  }
  finishSyntax(): boolean {
    try { this.utf8.decode(); } catch { this.bad = true; }
    if (this.mode === "scalar") this.endScalar();
    return !this.bad && !(this.rootType==="turn_context"&&this.oversizedTurnCandidate) && this.ended && this.stack.length === 0 && this.mode === "idle";
  }
  finish(): boolean { return this.finishSyntax() && this.irrelevant; }
  private importantType(frame: Frame | undefined): boolean {
    return frame?.key === "type" && (frame.context === "root" || this.purpose === "subagents" && frame.context !== "other");
  }
  private startString(key: boolean, capture: boolean): void {
    this.mode = "string"; this.keyToken = key; this.capture = capture; this.token = capture ? '"' : "";
  }
  private endString(): void {
    this.mode = "idle";
    const frame = this.stack.at(-1)!;
    if (this.keyToken) {
      let key = "";
      if (this.capture) { try { key = JSON.parse(this.token); } catch { this.bad = true; return; } }
      if (frame.seen) { if (frame.seen.size >= 128 || frame.seen.has(key)) { this.bad = true; return; } frame.seen.add(key); }
      frame.key = key; frame.phase = "colon";
    } else {
      if (this.capture) {
        if (frame.key === "type" && this.bytes > 4096) { this.bad = true; return; }
        let value: string; try { value = JSON.parse(this.purpose === "turn" ? Buffer.from(this.token,"latin1").toString("utf8") : this.token); } catch { this.bad = true; return; }
        if (frame.key === "type") {
          if (frame.context === "root") this.rootType = value;
          if (frame.context === "payload") this.payloadType = value;
          if (frame.context === "item") this.itemType = value;
        } else if (this.purpose === "turn") {
          if (frame.context === "root" && frame.key === "timestamp") this.turnTimestamp = value;
          if (frame.context === "payload" && frame.key === "model") this.turnModel = value;
          if (frame.context === "payload" && frame.key === "effort") this.turnEffort = value;
        }
      }
      this.valueDone();
    }
    this.token = "";
  }
  private endScalar(): void {
    if (!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(this.token)) this.bad = true;
    this.mode = "idle"; this.token = ""; this.valueDone();
  }
  private valueDone(): void { const frame = this.stack.at(-1); if (!frame) this.ended = true; else frame.phase = "commaOrEnd"; }
  private close(kind: "object" | "array"): void {
    if (this.stack.at(-1)?.kind !== kind) { this.bad = true; return; }
    this.stack.pop(); this.valueDone();
  }
}
