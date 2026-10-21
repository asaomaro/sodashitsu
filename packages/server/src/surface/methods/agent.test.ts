import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { MAX_AGENT_PROMPT_BYTES } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryLogger } from "../../log/Logger.js";
import type { InputModes } from "../../terminal/Mirror.js";
import type { ModalInput } from "../../terminal/TerminalHost.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerAgentMethods } from "./agent.js";
import type { MethodDeps } from "./deps.js";

/** `agent.prompt` / `agent.send_keys`（20260926-agent-prompt-send-keys design.md「`agent.prompt`（サーバ）」ほか）。 */

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1000,
    ...patch,
  };
}

class FakeHost {
  readonly modal: ModalInput[] = [];
  fail: Error | null = null;
  modes: InputModes = { bracketedPaste: false, applicationCursorKeys: false };
  /** 書いたとみなすバイト列（build をその時のモードで呼んだ結果）。 */
  readonly written: string[] = [];
  writeModal = vi.fn(async (input: ModalInput) => {
    this.modal.push(input);
    if (this.fail) throw this.fail;
    await input.prepare?.();
    this.written.push(...input.build(this.modes));
  });
}

function setup(paneAgent: AgentInfo | null = agent(), hasHost = true) {
  const host = new FakeHost();
  const pane = { id: "p1", tabId: "t1", agent: paneAgent } as unknown as Pane;
  const panes = new Map<string, Pane>([["p1", pane]]);
  const workspace = { projectDir: "/pj" };
  const noteInteraction = vi.fn();
  const deps = {
    session: {
      getPane: (id: string) => panes.get(id),
      getTab: () => ({ workspaceId: "w1" }),
      getWorkspace: () => workspace,
    },
    terminals: { get: (id: string) => (hasHost && id === "p1" ? host : undefined) },
    sizeAuthority: { noteInteraction },
  } as unknown as MethodDeps;
  const surface = new ControlSurface(new MemoryLogger());
  registerAgentMethods(surface, deps);
  const ctx = { clientId: "c1", sink: {} as never };
  const call = (
    method: "agent.prompt" | "agent.prompt_checked" | "agent.send_keys",
    params: unknown,
  ) => surface.invoke(ctx, method, params);
  /** 書く直前（build を呼ぶ前）のエージェントを差し替える——別の入力の後ろで待っている間の変化を模す。 */
  const changeAgentBeforeWrite = (next: AgentInfo | null): void => {
    const original = host.writeModal.getMockImplementation()!;
    host.writeModal.mockImplementationOnce(async (input: ModalInput) => {
      (pane as { agent: AgentInfo | null }).agent = next;
      return original(input);
    });
  };
  return { host, call, noteInteraction, changeAgentBeforeWrite, pane, workspace, surface, ctx };
}

function errorCode(result: Awaited<ReturnType<ReturnType<typeof setup>["call"]>>): string {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.result)}`);
  return result.error.code;
}

it("enforces an internal idle-only guard after queued input while ordinary prompts retain working support",async()=>{
  const s=setup();s.changeAgentBeforeWrite(agent({state:"working"}));
  const result=await s.surface.invoke({...s.ctx,agentPromptGuard:a=>{if(a.state!=="idle")throw Error("not idle");}},"agent.prompt",{paneId:"p1",text:"remote follow-up"});
  expect(result.ok).toBe(false);expect(s.host.written).toEqual([]);
  expect((await s.call("agent.prompt",{paneId:"p1",text:"ordinary prompt"})).ok).toBe(true);
});

it("revalidates a remote lease inside the input queue before building a follow-up",async()=>{
  const s=setup();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let valid=true;
  const prepare=vi.fn(async()=>{await gate;if(!valid)throw Error("revoked remote lease");});
  const result=s.surface.invoke({...s.ctx,agentPromptPrepare:prepare},"agent.prompt",{paneId:"p1",text:"queued follow-up"});
  await vi.waitFor(()=>expect(prepare).toHaveBeenCalled());valid=false;release();
  expect((await result).ok).toBe(false);expect(s.host.written).toEqual([]);
});

describe("agent.prompt", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4）", async () => {
    const result = await s.call("agent.prompt", { paneId: "p1", text: "line1\nline2" });
    expect(result).toEqual({ ok: true, result: { agent: agent() } });
    expect(s.host.modal).toHaveLength(1);
    expect(s.host.modal[0]!.delayMs).toBe(1000);
    expect(s.host.written).toEqual(["line1\nline2", "\r"]);
    expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");
  });

  it("bracketed paste が有効な瞬間なら本文を ESC[200~…ESC[201~ で包む（AC1）", async () => {
    s.host.modes = { bracketedPaste: true, applicationCursorKeys: false };
    await s.call("agent.prompt", { paneId: "p1", text: "a\nb" });
    expect(s.host.written).toEqual(["\u001b[200~a\nb\u001b[201~", "\r"]);
  });

  it("blocked のエージェントには何も書かずに agent_blocked（AC5）", async () => {
    s = setup(agent({ state: "blocked" }));
    expect(errorCode(await s.call("agent.prompt", { paneId: "p1", text: "yes" }))).toBe(
      "agent_blocked",
    );
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it.each(["working", "unknown", "idle"] as const)("%s のエージェントには送る", async (state) => {
    s = setup(agent({ state }));
    expect((await s.call("agent.prompt", { paneId: "p1", text: "x" })).ok).toBe(true);
    expect(s.host.writeModal).toHaveBeenCalledTimes(1);
  });

  it("pane が無い・エージェントが居ない・端末が無いときは書かずに agent_not_found（AC5）", async () => {
    expect(errorCode(await s.call("agent.prompt", { paneId: "nope", text: "x" }))).toBe(
      "agent_not_found",
    );
    const noAgent = setup(null);
    expect(errorCode(await noAgent.call("agent.prompt", { paneId: "p1", text: "x" }))).toBe(
      "agent_not_found",
    );
    expect(noAgent.host.writeModal).not.toHaveBeenCalled();
    const noHost = setup(agent(), false);
    expect(errorCode(await noHost.call("agent.prompt", { paneId: "p1", text: "x" }))).toBe(
      "agent_not_found",
    );
  });

  it("渡された instanceId と今のエージェントが違えば、書かずに agent_not_found（同じなら送る）", async () => {
    expect(
      errorCode(await s.call("agent.prompt", { paneId: "p1", instanceId: "a0", text: "x" })),
    ).toBe("agent_not_found");
    expect(s.host.writeModal).not.toHaveBeenCalled();
    expect((await s.call("agent.prompt", { paneId: "p1", instanceId: "a1", text: "x" })).ok).toBe(
      true,
    );
  });

  it("空の本文は書かずに empty_agent_prompt（AC5）", async () => {
    expect(errorCode(await s.call("agent.prompt", { paneId: "p1", text: "" }))).toBe(
      "empty_agent_prompt",
    );
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it("1MB を超える本文はスキーマで invalid_params（AC12）", async () => {
    expect(
      errorCode(
        await s.call("agent.prompt", {
          paneId: "p1",
          text: "a".repeat(MAX_AGENT_PROMPT_BYTES + 1),
        }),
      ),
    ).toBe("invalid_params");
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it("返すのは本文を書く直前のエージェント（受け付けた時点の working から idle に戻っていれば idle）", async () => {
    s = setup(agent({ state: "working" }));
    s.changeAgentBeforeWrite(agent({ state: "idle", completionSeq: 1 }));
    const result = await s.call("agent.prompt", { paneId: "p1", text: "x" });
    expect(result).toEqual({
      ok: true,
      result: { agent: agent({ state: "idle", completionSeq: 1 }) },
    });
  });

  it("受け付けた後、書く直前までに blocked になったら何も書かずに agent_blocked（ダイアログへの誤答を防ぐ）", async () => {
    s.changeAgentBeforeWrite(agent({ state: "blocked" }));
    expect(errorCode(await s.call("agent.prompt", { paneId: "p1", text: "yes" }))).toBe(
      "agent_blocked",
    );
    expect(s.host.written).toEqual([]);
  });

  it("書く直前までにエージェントが居なくなった・入れ替わったら何も書かずに agent_not_found（シェルへ流さない）", async () => {
    s.changeAgentBeforeWrite(null);
    expect(errorCode(await s.call("agent.prompt", { paneId: "p1", text: "rm -rf x" }))).toBe(
      "agent_not_found",
    );
    expect(s.host.written).toEqual([]);
    const replaced = setup();
    replaced.changeAgentBeforeWrite(agent({ instanceId: "a2" }));
    expect(errorCode(await replaced.call("agent.prompt", { paneId: "p1", text: "x" }))).toBe(
      "agent_not_found",
    );
    expect(replaced.host.modal).toHaveLength(1); // 受け付けて並んだ後で断った
    expect(replaced.host.written).toEqual([]);
  });

  it("送信中に端末が閉じたら agent_prompt_failed", async () => {
    s.host.fail = new Error("terminal closed");
    const result = await s.call("agent.prompt", { paneId: "p1", text: "x" });
    expect(result).toEqual({
      ok: false,
      error: { code: "agent_prompt_failed", message: "terminal closed" },
    });
  });
});

describe("agent.send_keys", () => {
  it("キー列をモードに合わせて符号化し、1 部分・遅延なしで書く。blocked でも送れる（AC10）", async () => {
    const s = setup(agent({ state: "blocked" }));
    s.host.modes = { bracketedPaste: false, applicationCursorKeys: true };
    const result = await s.call("agent.send_keys", {
      paneId: "p1",
      keys: ["esc", "up", "C-c", "enter"],
    });
    expect(result).toEqual({ ok: true, result: {} });
    expect(s.host.modal[0]!.delayMs).toBe(0);
    expect(s.host.written).toEqual(["\u001b\u001bOA\u0003\r"]);
    expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");
  });

  it("不明なキー名・符号化できない組み合わせが 1 つでもあれば何も書かずに invalid_key（AC11）", async () => {
    const s = setup();
    expect(
      errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: ["esc", "hyper+x"] })),
    ).toBe("invalid_key");
    expect(errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: ["ctrl+enter"] }))).toBe(
      "invalid_key",
    );
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it("pane が無い・エージェントが居ないと agent_not_found、キーが 0 個は invalid_params（AC11）", async () => {
    const s = setup(null);
    expect(errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: ["esc"] }))).toBe(
      "agent_not_found",
    );
    expect(errorCode(await s.call("agent.send_keys", { paneId: "nope", keys: ["esc"] }))).toBe(
      "agent_not_found",
    );
    expect(errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: [] }))).toBe(
      "invalid_params",
    );
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it("渡された instanceId と今のエージェントが違えば、書かずに agent_not_found（別のエージェントのダイアログに答えない）", async () => {
    const s = setup(agent({ state: "blocked" }));
    expect(
      errorCode(
        await s.call("agent.send_keys", { paneId: "p1", instanceId: "a0", keys: ["y", "enter"] }),
      ),
    ).toBe("agent_not_found");
    expect(s.host.writeModal).not.toHaveBeenCalled();
  });

  it("書く直前までにエージェントが入れ替わっていたら何も書かずに agent_not_found（decisions.md D7）", async () => {
    const s = setup();
    s.changeAgentBeforeWrite(agent({ instanceId: "a2" }));
    expect(errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: ["y", "enter"] }))).toBe(
      "agent_not_found",
    );
    expect(s.host.modal).toHaveLength(1);
    expect(s.host.written).toEqual([]);
  });

  it("書いている途中で端末が閉じたら agent_not_found", async () => {
    const s = setup();
    s.host.fail = new Error("terminal closed");
    expect(errorCode(await s.call("agent.send_keys", { paneId: "p1", keys: ["esc"] }))).toBe(
      "agent_not_found",
    );
  });
});

describe("agent.prompt expected scope", () => {
  const expectation = {
    paneId: "p1",
    instanceId: "a1",
    tabId: "t1",
    projectDir: "/pj",
    name: "task-one",
  };
  it("accepts a matching target and refuses a name resolved to another pane", async () => {
    const s = setup(agent({ name: "task-one" }));
    expect(
      (await s.call("agent.prompt", { paneId: "p1", text: "update", expect: expectation })).ok,
    ).toBe(true);
    s.host.written.length = 0;
    expect(
      errorCode(
        await s.call("agent.prompt", {
          paneId: "p1",
          text: "update",
          expect: { ...expectation, paneId: "other" },
        }),
      ),
    ).toBe("agent_not_found");
    expect(s.host.written).toEqual([]);
  });
  it.each(["tab", "project", "instance", "name"])(
    "refuses %s changes while queued before writing",
    async (change) => {
      const s = setup(agent({ name: "task-one" }));
      const original = s.host.writeModal.getMockImplementation()!;
      s.host.writeModal.mockImplementationOnce(async (input) => {
        if (change === "tab") s.pane.tabId = "other";
        if (change === "project") s.workspace.projectDir = "/other";
        if (change === "instance") s.pane.agent!.instanceId = "replacement";
        if (change === "name") s.pane.agent!.name = "renamed";
        return original(input);
      });
      expect(
        errorCode(
          await s.call("agent.prompt", { paneId: "p1", text: "update", expect: expectation }),
        ),
      ).toBe("agent_not_found");
      expect(s.host.written).toEqual([]);
    },
  );
});

it("requires an expectation for the checked-only method", async () => {
  const s = setup(agent({ name: "task-one" }));
  expect(errorCode(await s.call("agent.prompt_checked", { paneId: "p1", text: "update" }))).toBe(
    "invalid_params",
  );
  expect(
    (
      await s.call("agent.prompt_checked", {
        paneId: "p1",
        text: "update",
        expect: {
          paneId: "p1",
          instanceId: "a1",
          tabId: "t1",
          projectDir: "/pj",
          name: "task-one",
        },
      })
    ).ok,
  ).toBe(true);
});

it("an internal cancelled scheduled prompt waiting in the modal queue never writes", async () => {
  const s = setup(),
    abort = new AbortController();
  let release!: () => void;
  s.host.writeModal.mockImplementationOnce(async (input) => {
    await new Promise<void>((resolve) => (release = resolve));
    s.host.written.push(...input.build(s.host.modes));
  });
  const pending = s.surface.invoke({ ...s.ctx, signal: abort.signal }, "agent.prompt", {
    paneId: "p1",
    text: "late instruction",
  });
  abort.abort();
  release();
  expect((await pending).ok).toBe(false);
  expect(s.host.written).toEqual([]);
});
