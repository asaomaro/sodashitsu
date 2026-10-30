import { randomUUID } from "node:crypto";
import { pngSize } from "./png.js";
import { z } from "zod";
import {
  IMAGE_CHUNK_BYTES,
  ASSISTANT_AUDIO_CHUNK_BYTES,
  ASSISTANT_AUDIO_MAX_BYTES,
  AssistantAudioMime,
  AssistantAgentKind,
  AssistantLaunchSettings,
  AssistantAgentProfiles,
  type AssistantSessionInfo,
  type ConversationMessage,
  type ConversationPage,
} from "@sodashitsu/protocol";
import type { AssistantRpc } from "./assistantRpc.js";

const Actor = z
  .object({
    instanceId: z.uuid(),
    kind: z.string().max(64),
    label: z.string().max(500),
    state: z.enum(["blocked", "working", "idle", "unknown"]),
    completionSeq: z.number().int().nonnegative(),
    serverSeenSeq: z.number().int().nonnegative(),
    verified: z.boolean(),
    since: z.number().finite(),
    name: z.string().max(32).optional(),
  })
  .transform(({ name, ...actor }) => ({ ...actor, ...(name === undefined ? {} : { name }) }));
const Info = z.object({
  deviceId: z.uuid(),
  workspaceId: z.uuid(),
  tabId: z.uuid().nullable(),
  paneId: z.uuid(),
  kind: AssistantAgentKind,
  launchSettings: AssistantLaunchSettings.optional(),
  state: z.enum(["shell", "starting", "ready", "stopped", "conflict"]),
  agent: Actor.nullable(),
  observedAgent: Actor.nullable(),
});
const Kinds = z.object({
  kinds: z
    .array(
      z.object({ kind: AssistantAgentKind, label: z.string().max(500), available: z.boolean() }),
    )
    .max(128),
});
const Page = z
  .object({
    kind: z.enum(["claude", "codex"]),
    sessionId: z.string().min(1).max(128),
    messages: z
      .array(
        z
          .object({
            id: z.string().max(500),
            role: z.enum(["user", "assistant"]),
            text: z.string().max(8192),
            at: z.string().max(100).optional(),
          })
          .transform(({ at, ...message }) => ({ ...message, ...(at === undefined ? {} : { at }) })),
      )
      .max(100),
    nextOffset: z
      .number()
      .int()
      .min(0)
      .max(1024 ** 3)
      .nullable(),
    partial: z.boolean(),
    endOffset: z
      .number()
      .int()
      .min(0)
      .max(1024 ** 3)
      .optional(),
  })
  .transform(({ endOffset, ...page }) => ({
    ...page,
    ...(endOffset === undefined ? {} : { endOffset }),
  }));
const Revision = z.number().int().nonnegative();
const Start = z
  .object({ revision: Revision, kind: AssistantAgentKind, retry: z.boolean().default(false) })
  .strict();
const Adopt = z.object({ revision: Revision, instanceId: z.uuid() }).strict();
const Send = Adopt.extend({ text: z.string().trim().min(1).max(8192) }).strict();

export interface AssistantChatState {
  revision: number;
  connected: boolean;
  busy: boolean;
  session: AssistantSessionInfo | null;
  kinds: { kind: string; label: string; available: boolean }[];
  messages: ConversationMessage[];
  hint: string;
  launchProfiles?: ReturnType<typeof AssistantAgentProfiles.parse>;
}

/** Main owns the installation/target. Renderer supplies a revision and intended actor, never a pane. */
export class AssistantChat {
  private profiles = AssistantAgentProfiles.parse({});
  configure(profiles: unknown): void {
    this.profiles = AssistantAgentProfiles.parse(profiles);
    this.publish();
  }
  private generation = 0;
  private reading = false;
  private refreshAgain = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private conversationId: string | null = null;
  private state: AssistantChatState = {
    revision: 0,
    connected: false,
    busy: false,
    session: null,
    kinds: [],
    messages: [],
    hint: "操舵室へ接続しています。",
  };
  constructor(
    private readonly deviceId: string,
    private readonly rpc: Pick<AssistantRpc, "request">,
    private readonly changed: (state: AssistantChatState) => void,
    revision = 0,
  ) {
    this.state.revision = revision;
  }
  snapshot(): AssistantChatState {
    return structuredClone({ ...this.state, launchProfiles: this.profiles });
  }
  connection(connected: boolean): void {
    ++this.generation;
    this.state.connected = connected;
    this.state.busy = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (connected) {
      this.state.hint = "専用セッションを確認しています。";
      this.timer = setInterval(() => {
        void this.refresh();
      }, 2000);
      void this.refresh();
    } else this.state.hint = "接続が切れました。送信済みか確認してから操作してください。";
    this.publish();
  }
  stop(): void {
    this.connection(false);
  }
  async refresh(): Promise<void> {
    if (!this.state.connected) return;
    if (this.reading) {
      this.refreshAgain = true;
      return;
    }
    this.reading = true;
    const generation = this.generation;
    const live = () => this.state.connected && generation === this.generation;
    try {
      const raw = await this.rpc.request("assistant.get", { deviceId: this.deviceId });
      if (!live()) return;
      let info = raw === null ? null : Info.parse(raw) as AssistantSessionInfo;
      if (info?.deviceId !== undefined && info.deviceId !== this.deviceId)
        throw Error("端末の識別情報が一致しません。");
      if (info?.state === "starting" && info.observedAgent && !this.state.busy) {
        // Server only claims evidence from its actual launch reservation; this never retries stopped work.
        const next = await this.rpc.request("assistant.ensure", {
          deviceId: this.deviceId,
          kind: info.kind,
          retry: false,
          activate: false,
        });
        if (!live()) return;
        info = Info.parse(next) as AssistantSessionInfo;
      }
      this.apply(info);
      if (!this.state.kinds.length) {
        const kinds = await this.rpc.request("agent.kinds", {});
        if (!live()) return;
        this.state.kinds = Kinds.parse(kinds).kinds;
      }
      if (info?.state === "ready" && info.agent && ["claude", "codex"].includes(info.kind)) {
        try {
          const rawPage = await this.rpc.request("agent.conversation", {
            paneId: info.paneId,
            offset: this.cursor,
          });
          if (!live()) return;
          const currentRaw = await this.rpc.request("assistant.get", { deviceId: this.deviceId });
          if (!live()) return;
          const current = currentRaw === null ? null : Info.parse(currentRaw);
          this.apply(current);
          if (
            current?.state !== "ready" ||
            current.agent?.instanceId !== info.agent.instanceId ||
            current.paneId !== info.paneId
          )
            return;
          const page = Page.parse(rawPage);
          if (page.kind !== info.kind) throw Error("会話の種類が変わりました。");
          this.append(page);
          this.state.hint =
            current.agent.state === "blocked"
              ? "船長が確認を待っています。操舵室の端末から回答してください。"
              : current.agent.state === "working"
                ? "船長が作業しています。"
                : page.partial
                  ? "会話の一部を表示しています。詳しくは操舵室の端末で確認できます。"
                  : "船長へのメッセージを送れます。";
        } catch {
          if (!live()) return;
          this.cursor = 0;
          this.state.hint =
            "会話記録を待っています。質問や承認の画面は操舵室の端末で確認できます。";
        }
      }
    } catch (error) {
      if (live())
        this.state.hint =
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "専用セッションを確認できません。";
    } finally {
      this.reading = false;
      if (live()) this.publish();
      if (this.refreshAgain) {
        this.refreshAgain = false;
        void this.refresh();
      }
    }
  }
  start(input: unknown): Promise<void> {
    const request = Start.parse(input);
    this.assertRevision(request.revision);
    if (!this.state.kinds.some((kind) => kind.kind === request.kind && kind.available))
      throw Error("このエージェントは接続先で利用できません。");
    return this.act(async () => {
      await this.rpc.request("assistant.ensure", {
        deviceId: this.deviceId,
        kind: request.kind,
        retry: request.retry,
        activate: true,
        ...((request.kind === "claude" || request.kind === "codex") ? { launchSettings: this.profiles[request.kind] } : {}),
      });
    });
  }
  /** Main-only, preview-approved pixels. No arbitrary renderer path or prompt is accepted. */
  image(bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    pngSize(bytes);
    const pixels = new Uint8Array(bytes);
    const session = this.state.session;
    const actor = session?.agent;
    if (!this.state.connected || session?.state !== "ready" || !actor || actor.state !== "idle" || !["claude", "codex"].includes(session.kind))
      throw Error("画像を読めるClaude CodeまたはCodexの専用セッションを開始してください。");
    const generation = this.generation;
    const expires = performance.now() + 60000;
    const live = () => {
      signal.throwIfAborted();
      if (performance.now() >= expires || !this.state.connected || generation !== this.generation || this.state.session?.paneId !== session.paneId || this.state.session.agent?.instanceId !== actor.instanceId || this.state.session.agent.state !== "idle")
        throw Error("画像の送信先が変更されたか期限が切れました。");
    };
    return this.act(async () => {
      let uploadId: string | null = null;
      try {
        live();
        const result = await this.rpc.request("pane.image.begin", {paneId:session.paneId, mime:"image/png", size:pixels.byteLength});
        uploadId = z.string().min(1).max(200).parse(result.uploadId);
        for (let offset=0;offset<pixels.byteLength;offset+=IMAGE_CHUNK_BYTES) {
          live();
          await this.rpc.request("pane.image.chunk", {uploadId,offset,data:Buffer.from(pixels.subarray(offset,offset+IMAGE_CHUNK_BYTES)).toString("base64")});
        }
        live();
        const saved = await this.rpc.request("pane.image.commit", {uploadId});
        uploadId = null;
        const path = z.string().min(1).max(4096).regex(/^(?:\/|[A-Za-z]:[\\/])/).refine(value=>!/[\x00-\x1f\x7f]/.test(value)).parse(saved.path);
        live();
        const imageRequestId = randomUUID();
        let cancellation: Promise<unknown> | null = null;
        const cancel = () => {
          if (!cancellation && this.state.connected && generation === this.generation)
            cancellation = this.rpc.request("assistant.cancel_image", {requestId:imageRequestId}).catch(()=>{});
        };
        const ttlMs = Math.max(1, Math.floor(expires - performance.now()));
        const timer = setTimeout(cancel, ttlMs);
        signal.addEventListener("abort",cancel,{once:true});
        try {
          live();
          await this.rpc.request("assistant.prompt", {deviceId:this.deviceId,instanceId:actor.instanceId,imageRequestId,ttlMs,
            text:`追加のOCRプログラムやAIサービスを起動せず、モデルの画像入力機能で次の画像ファイルを読み、写っている文字を転記してください。画像入力に対応しない場合は未対応と回答してください。読み取れない部分は推測せず明記してください。結果はこの会話に返してください。画像ファイル: ${JSON.stringify(path)}`});
        } catch (error) {cancel();throw error;}
        finally {clearTimeout(timer);signal.removeEventListener("abort",cancel);if(signal.aborted||performance.now()>=expires)cancel();await cancellation;}

      } finally {
        pixels.fill(0);
        if (uploadId && this.state.connected && generation === this.generation)
          await this.rpc.request("pane.image.cancel", {uploadId}).catch(()=>{});
      }
    });
  }
  adopt(input: unknown): Promise<void> {
    const request = Adopt.parse(input);
    this.assertRevision(request.revision);
    if (this.state.session?.observedAgent?.instanceId !== request.instanceId)
      throw Error("選んだエージェントが変わりました。");
    return this.act(async () => {
      await this.rpc.request("assistant.adopt", {
        deviceId: this.deviceId,
        instanceId: request.instanceId,
      });
    });
  }

  /** Reviewed main-owned audio only. The renderer cannot choose a server path or thread. */
  prepareAudio(): (audio:{bytes:Uint8Array;mime:string},signal:AbortSignal,expires:number)=>Promise<void> {
    const generation=this.generation,paneId=this.state.session?.paneId,instanceId=this.state.session?.agent?.instanceId;
    if(!this.state.connected || this.state.session?.kind!=="codex" || this.state.session.state!=="ready" || this.state.session.agent?.state!=="idle")throw Error("待機中のCodex専用セッションを選んでください");
    return(audio,signal,expires)=>{
      if(generation!==this.generation || !this.state.connected || this.state.session?.paneId!==paneId || this.state.session?.agent?.instanceId!==instanceId)throw Error("音声を選んでいる間に送信先が変更されました");
      return this.audio(audio.bytes,audio.mime,signal,expires);
    };
  }
  audio(bytes:Uint8Array,mime:string,signal:AbortSignal,originalExpires=performance.now()+300000):Promise<void> {
    const type=AssistantAudioMime.parse(mime.split(";")[0]);
    if(!bytes.length || bytes.length>ASSISTANT_AUDIO_MAX_BYTES)throw Error("音声は25MiB以内にしてください");
    const session=this.state.session,actor=session?.agent;
    if(!this.state.connected || session?.state!=="ready" || session.kind!=="codex" || !actor || actor.state!=="idle")throw Error("音声入力対応モデルを使う、待機中のCodex専用セッションを選んでください");
    const generation=this.generation,expires=Math.min(originalExpires,performance.now()+300000),audio=new Uint8Array(bytes);
    const live=()=>{
      signal.throwIfAborted();
      if(performance.now()>=expires || !this.state.connected || generation!==this.generation || this.state.session?.paneId!==session.paneId || this.state.session.agent?.instanceId!==actor.instanceId || this.state.session.agent.state!=="idle")throw Error("音声の送信先が変更されたか期限が切れました");
    };
    return this.act(async()=>{
      let uploadId:string|null=null,cancellation:Promise<unknown>|null=null,accepted=false;
      const cancel=()=>{
        if(uploadId && !cancellation && this.state.connected && generation===this.generation)cancellation=this.rpc.request("assistant.audio_cancel",{uploadId}).catch(()=>{});
      };
      signal.addEventListener("abort",cancel,{once:true});const timer=setTimeout(cancel,Math.max(1,expires-performance.now()));
      try {
        live();const result=await this.rpc.request("assistant.audio_begin",{deviceId:this.deviceId,instanceId:actor.instanceId,mime:type,size:audio.length,ttlMs:Math.max(1,Math.floor(expires-performance.now()))});
        uploadId=z.uuid().parse(result.uploadId);
        for(let offset=0;offset<audio.length;offset+=ASSISTANT_AUDIO_CHUNK_BYTES){live();await this.rpc.request("assistant.audio_chunk",{uploadId,offset,data:Buffer.from(audio.subarray(offset,offset+ASSISTANT_AUDIO_CHUNK_BYTES)).toString("base64")});}
        live();const receipt=z.object({sent:z.literal(true),turnId:z.string().min(1).max(128)}).parse(await this.rpc.request("assistant.audio_commit",{uploadId}));
        accepted=receipt.sent;
      } finally {
        clearTimeout(timer);signal.removeEventListener("abort",cancel);audio.fill(0);
        if(!accepted)cancel();await cancellation;
      }
    });
  }
  send(input: unknown): Promise<void> {
    const request = Send.parse(input);
    this.assertRevision(request.revision);
    const info = this.state.session;
    if (info?.state !== "ready" || info.agent?.instanceId !== request.instanceId)
      throw Error("送信先が変わりました。確認してください。");
    if (info.agent.state !== "idle")
      throw Error("質問や承認には操舵室の端末から答えてください。作業中は完了をお待ちください。");
    return this.act(async () => {
      await this.rpc.request("assistant.prompt", {
        deviceId: this.deviceId,
        instanceId: request.instanceId,
        text: request.text,
      });
    });
  }
  private async act(operation: () => Promise<void>): Promise<void> {
    if (this.state.busy) throw Error("前の操作が完了するまでお待ちください。");
    const generation = this.generation;
    this.state.busy = true;
    this.publish();
    try {
      await operation();
      if (generation !== this.generation)
        throw Error("接続が変わりました。操作の結果を確認してください。");
    } finally {
      if (generation === this.generation) {
        this.state.busy = false;
        this.publish();
        void this.refresh();
      }
    }
  }
  private assertRevision(revision: number): void {
    if (!this.state.connected || revision !== this.state.revision)
      throw Error("接続先の状態が変わりました。表示を確認して操作し直してください。");
  }
  private apply(info: AssistantSessionInfo | null): void {
    if (
      this.state.session?.agent?.instanceId !== info?.agent?.instanceId ||
      this.state.session?.paneId !== info?.paneId
    ) {
      this.state.messages = [];
      this.cursor = 0;
      this.conversationId = null;
    }
    this.state.session = info;
    this.state.hint = !info
      ? "使うエージェントを選び、専用セッションを開始してください。"
      : info.state === "conflict"
        ? "専用端末のエージェントが変わりました。操舵室で対象を確認して選び直してください。"
        : info.state === "starting"
          ? "専用エージェントの起動を待っています。"
          : info.state === "stopped"
            ? "専用エージェントは停止しています。端末を確認してから新しく開始できます。"
            : info.state === "shell"
              ? "専用セッションの起動を選んでください。"
              : "専用セッションに接続しています。";
  }
  private append(page: ConversationPage): void {
    if (this.conversationId !== page.sessionId) {
      this.state.messages = [];
      this.conversationId = page.sessionId;
      if (this.cursor > 0) {
        this.cursor = 0;
        return; // /clear can change the conversation while preserving the same detected actor.
      }
    }
    const messages = new Map(this.state.messages.map((message) => [message.id, message]));
    for (const message of page.messages) messages.set(message.id, message);
    this.state.messages = [...messages.values()].slice(-100);
    this.cursor = page.endOffset ?? page.nextOffset ?? this.cursor;
  }
  private publish(): void {
    ++this.state.revision;
    this.changed(this.snapshot());
  }
}
