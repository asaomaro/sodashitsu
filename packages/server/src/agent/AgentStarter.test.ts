import type { AgentInfo, AgentStartParams, Pane } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ForegroundJob } from "../platform/ProcessInspector.js";
import type { InputModes } from "../terminal/Mirror.js";
import type { ModalInput, TerminalHost } from "../terminal/TerminalHost.js";
import { AgentStarter, type AgentStarterOptions } from "./AgentStarter.js";

/** `AgentStarter`（20260926-agent-start design「サーバ `AgentStarter.start`」。AC3〜AC6・AC8・AC9・AC11・AC15）。 */

const SHELL_PID = 100;

function idleJob(exe = "/bin/bash"): ForegroundJob {
  return {
    processGroupId: SHELL_PID,
    processes: [{ pid: SHELL_PID, exe, argv: [exe], cwd: null }],
  };
}

const AGENT: AgentInfo = {
  instanceId: "a1",
  kind: "claude",
  label: "Claude Code",
  state: "idle",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
};

interface Harness {
  starter: AgentStarter;
  written: string[];
  delays: number[];
  session: {
    getPane: ReturnType<typeof vi.fn>;
    assertAgentNameAvailable: ReturnType<typeof vi.fn>;
    beginAgentLaunch: ReturnType<typeof vi.fn>;
    endAgentLaunch: ReturnType<typeof vi.fn>;
    hasAgentLaunch: ReturnType<typeof vi.fn>;
    hasPendingResume: ReturnType<typeof vi.fn>;
  };
  foregroundJob: ReturnType<typeof vi.fn>;
  host: TerminalHost;
  pane: { agent: AgentInfo | null };
  terminalsGet: () => TerminalHost;
}

function harness(
  opts: {
    job?: () => Promise<ForegroundJob | null>;
    modes?: Partial<InputModes>;
    platform?: NodeJS.Platform;
    writeFails?: boolean;
  } = {},
): Harness {
  const written: string[] = [];
  const delays: number[] = [];
  const modes: InputModes = { bracketedPaste: false, applicationCursorKeys: false, ...opts.modes };
  const host = {
    pid: SHELL_PID,
    writeModal: vi.fn(async (input: ModalInput) => {
      if (opts.writeFails) throw new Error("terminal closed");
      await input.prepare?.();
      delays.push(input.delayMs);
      written.push(...input.build(modes));
    }),
  } as unknown as TerminalHost;
  const pane = { agent: null as AgentInfo | null };
  const session = {
    getPane: vi.fn((id: string) => (id === "p1" ? (pane as unknown as Pane) : undefined)),
    assertAgentNameAvailable: vi.fn(),
    beginAgentLaunch: vi.fn(() => 7),
    endAgentLaunch: vi.fn(),
    hasAgentLaunch: vi.fn(() => false),
    hasPendingResume: vi.fn(() => false),
  };
  const foregroundJob = vi.fn(opts.job ?? (() => Promise.resolve(idleJob())));
  const h = { written, delays, session, host, pane, terminalsGet: () => host } as Omit<
    Harness,
    "starter" | "foregroundJob"
  >;
  const starter = new AgentStarter({
    session: session as unknown as AgentStarterOptions["session"],
    terminals: { get: (id: string) => (id === "p1" ? h.terminalsGet() : undefined) },
    processInspector: { foregroundJob },
    platform: opts.platform ?? "linux",
  });
  return Object.assign(h, { starter, foregroundJob });
}

const PARAMS: AgentStartParams = {
  name: "reviewer",
  kind: "claude",
  paneId: "p1",
  args: ["--model", "x y"],
};

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof RpcError) return err.code;
    throw err;
  }
  throw new Error("expected an RpcError");
}

describe("AgentStarter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("空いている bash に、Ctrl-C の 200 ms 後に打ちかけの消去・固定の実行ファイル名・包んだ引数・CR を書き、予約して返す（AC1・AC11）", async () => {
    const h = harness();
    await expect(h.starter.start(PARAMS)).resolves.toEqual({
      paneId: "p1",
      name: "reviewer",
      kind: "claude",
      argv: ["claude", "--model", "x y"],
    });
    expect(h.written).toEqual(["\u0003", "\u0005\u0015claude '--model' 'x y'\r"]);
    expect(h.delays).toEqual([200]);
    expect(h.session.beginAgentLaunch).toHaveBeenCalledWith("p1", "reviewer", "claude");
    expect(h.foregroundJob).toHaveBeenCalledWith(SHELL_PID);
  });

  it("bracketed paste が有効ならコマンド行を貼り付けで包む。kind が cursor なら cursor-agent（AC11）", async () => {
    const h = harness({ modes: { bracketedPaste: true } });
    await h.starter.start({ ...PARAMS, kind: "cursor", args: [] });
    expect(h.written).toEqual(["\u0003", "\u0005\u0015\u001b[200~cursor-agent\u001b[201~\r"]);
  });

  it("締め切り（既定 30000 ms・指定値）で予約を解く（AC3・AC15）", async () => {
    const h = harness();
    await h.starter.start(PARAMS);
    vi.advanceTimersByTime(29_999);
    expect(h.session.endAgentLaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.session.endAgentLaunch).toHaveBeenCalledWith("p1", 7);

    const h2 = harness();
    await h2.starter.start({ ...PARAMS, timeoutMs: 5000 });
    vi.advanceTimersByTime(5000);
    expect(h2.session.endAgentLaunch).toHaveBeenCalledWith("p1", 7);
  });

  const rejects: [string, Partial<AgentStartParams>, string][] = [
    ["名前の書式違反", { name: "Reviewer" }, "invalid_agent_name"],
    ["表に無い kind", { kind: "sh" }, "unsupported_agent_kind"],
    ["別名の kind", { kind: "claude-code" }, "unsupported_agent_kind"],
    ["継承したキーの kind", { kind: "__proto__" }, "unsupported_agent_kind"],
    ["改行", { args: ["ok", "a\nb"] }, "invalid_agent_argument"],
    ["CR", { args: ["a\rb"] }, "invalid_agent_argument"],
    ["タブ", { args: ["a\tb"] }, "invalid_agent_argument"],
    ["ESC", { args: ["\u001b[201~"] }, "invalid_agent_argument"],
    ["NUL", { args: ["\u0000"] }, "invalid_agent_argument"],
    ["DEL", { args: ["\u007f"] }, "invalid_agent_argument"],
    ["C1", { args: ["\u009b"] }, "invalid_agent_argument"],
    ["4000 バイト超の行", { args: ["x".repeat(3992)] }, "invalid_agent_argument"],
    // 文字数（1409）ではなくバイト数（4209）で数える（test 工程の負の確認で追加）
    ["多バイト文字で 4000 バイト超の行", { args: ["あ".repeat(1400)] }, "invalid_agent_argument"],
    ["timeout 3000", { timeoutMs: 3000 }, "invalid_agent_timeout"],
    ["timeout 300001", { timeoutMs: 300_001 }, "invalid_agent_timeout"],
    ["存在しない pane", { paneId: "p9" }, "agent_pane_not_found"],
  ];
  it.each(rejects)(
    "%s は %s… 何も書かず・予約せず・前面も見ない（AC4〜AC6・AC8・AC15）",
    async (_label, patch, code) => {
      const h = harness();
      expect(await codeOf(h.starter.start({ ...PARAMS, ...patch }))).toBe(code);
      expect(h.written).toEqual([]);
      expect(h.session.beginAgentLaunch).not.toHaveBeenCalled();
      expect(h.foregroundJob).not.toHaveBeenCalled();
    },
  );

  it("pane はあるが端末が無ければ agent_pane_not_found で何も書かない（test 工程の負の確認で追加）", async () => {
    const h = harness();
    h.terminalsGet = () => undefined as unknown as TerminalHost;
    expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_pane_not_found");
    expect(h.written).toEqual([]);
    expect(h.session.beginAgentLaunch).not.toHaveBeenCalled();
    expect(h.foregroundJob).not.toHaveBeenCalled();
  });

  it("4000 バイトちょうどの行は受け付ける（上限の境界）", async () => {
    const h = harness();
    // "claude " (7) + "'" + x + "'" = 4000
    await h.starter.start({ ...PARAMS, args: ["x".repeat(3991)] });
    expect(h.written).toHaveLength(2);
  });

  it("live な名前・予約との重複は agent_name_taken で何も書かない（AC4）", async () => {
    const h = harness();
    h.session.assertAgentNameAvailable.mockImplementation(() => {
      throw new RpcError("agent_name_taken", "taken");
    });
    expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_name_taken");
    expect(h.written).toEqual([]);
  });

  const busyCases: [string, (h: Harness) => void][] = [
    ["エージェントが検出されている", (h) => (h.pane.agent = AGENT)],
    ["同じ pane で起動中", (h) => h.session.hasAgentLaunch.mockReturnValue(true)],
    [
      "復元で打ち込んだ会話の再開がまだ検出されていない",
      (h) => h.session.hasPendingResume.mockReturnValue(true),
    ],
    [
      "前面が sleep",
      (h) =>
        h.foregroundJob.mockResolvedValue({
          processGroupId: 101,
          processes: [{ pid: 101, exe: "sleep", argv: ["sleep"], cwd: null }],
        }),
    ],
    ["前面が取得できない（null）", (h) => h.foregroundJob.mockResolvedValue(null)],
    ["前面の取得が reject", (h) => h.foregroundJob.mockRejectedValue(new Error("boom"))],
    [
      "シェルのグループに別のプロセスがいる",
      (h) =>
        h.foregroundJob.mockResolvedValue({
          processGroupId: SHELL_PID,
          processes: [...idleJob().processes, { pid: 102, exe: "cat", argv: ["cat"], cwd: null }],
        }),
    ],
  ];
  it.each(busyCases)("%s なら agent_pane_busy で何も書かない（AC8）", async (_label, arrange) => {
    const h = harness();
    arrange(h);
    expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_pane_busy");
    expect(h.written).toEqual([]);
    expect(h.session.beginAgentLaunch).not.toHaveBeenCalled();
  });

  it("前面の取得が上限（2000 ms）を過ぎても返らなければ agent_pane_busy（AC8）", async () => {
    const h = harness({ job: () => new Promise<never>(() => undefined) });
    const result = codeOf(h.starter.start(PARAMS));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("agent_pane_busy");
    expect(h.written).toEqual([]);
  });

  it("前面を待つ間にエージェントが現れた・起動が入った・pane が閉じたら書かない", async () => {
    const changes: [(h: Harness) => void, string][] = [
      [(h) => (h.pane.agent = AGENT), "agent_pane_busy"],
      [(h) => h.session.hasAgentLaunch.mockReturnValue(true), "agent_pane_busy"],
      [(h) => h.session.getPane.mockReturnValue(undefined), "agent_pane_not_found"],
      [(h) => (h.terminalsGet = () => ({ ...h.host }) as TerminalHost), "agent_pane_busy"],
      [
        (h) =>
          h.session.beginAgentLaunch.mockImplementation(() => {
            throw new RpcError("agent_name_taken", "taken");
          }),
        "agent_name_taken",
      ],
    ];
    for (const [change, code] of changes) {
      let release!: (job: ForegroundJob) => void;
      const h = harness({ job: () => new Promise((resolve) => (release = resolve)) });
      const result = codeOf(h.starter.start(PARAMS));
      await Promise.resolve();
      change(h);
      release(idleJob());
      expect(await result).toBe(code);
      expect(h.written).toEqual([]);
      expect(h.host.writeModal).not.toHaveBeenCalled();
    }
  });

  it("書く直前（他の入力の後ろで待った後）にエージェントが検出されていたら何も書かず、予約を解いて agent_pane_busy", async () => {
    const h = harness();
    (h.host.writeModal as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: ModalInput) => {
        h.pane.agent = AGENT;
        h.written.push(...input.build({ bracketedPaste: false, applicationCursorKeys: false }));
      },
    );
    expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_pane_busy");
    expect(h.written).toEqual([]);
    expect(h.session.endAgentLaunch).toHaveBeenCalledWith("p1", 7);
  });

  // review ラウンド 1：最初の確認の後に前面が替わった（ブラウザから vim 等を始めた）ら、書く直前の確かめ直しで止める。
  const lateCases: [string, () => Promise<ForegroundJob | null>][] = [
    [
      "前面が vim",
      () =>
        Promise.resolve({
          processGroupId: 102,
          processes: [{ pid: 102, exe: "vim", argv: ["vim"], cwd: null }],
        }),
    ],
    [
      "シェルのグループにシェル以外が居る",
      () =>
        Promise.resolve({
          processGroupId: SHELL_PID,
          processes: [
            { pid: SHELL_PID, exe: "/bin/bash", argv: ["bash"], cwd: null },
            { pid: 103, exe: "cat", argv: ["cat"], cwd: null },
          ],
        }),
    ],
    ["前面を取得できない", () => Promise.resolve(null)],
    ["前面がシェルだが fish に替わった", () => Promise.resolve(idleJob("/usr/bin/fish"))],
  ];
  it.each(lateCases)(
    "書く直前の確かめ直しで%sなら何も書かず、予約を解いて agent_pane_busy",
    async (_label, second) => {
      const h = harness();
      h.foregroundJob.mockImplementationOnce(() => Promise.resolve(idleJob()));
      h.foregroundJob.mockImplementationOnce(second);
      expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_pane_busy");
      expect(h.foregroundJob).toHaveBeenCalledTimes(2);
      expect(h.written).toEqual([]);
      expect(h.session.endAgentLaunch).toHaveBeenCalledWith("p1", 7);
    },
  );

  it("onAccepted は予約の後・書き込みの前に 1 回だけ呼び、拒否した要求では呼ばない（review ラウンド 1）", async () => {
    const h = harness();
    const order: string[] = [];
    h.session.beginAgentLaunch.mockImplementation(() => (order.push("reserve"), 7));
    (h.host.writeModal as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("write");
    });
    await h.starter.start(PARAMS, () => order.push("accepted"));
    expect(order).toEqual(["reserve", "accepted", "write"]);

    const rejected = harness({
      job: () =>
        Promise.resolve({
          processGroupId: 101,
          processes: [{ pid: 101, exe: "sleep", argv: ["sleep"], cwd: null }],
        }),
    });
    const onAccepted = vi.fn();
    expect(await codeOf(rejected.starter.start(PARAMS, onAccepted))).toBe("agent_pane_busy");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("書く直前の確かめ直しは、最初の確認と同じ pid の前面を見る", async () => {
    const h = harness();
    await h.starter.start(PARAMS);
    expect(h.foregroundJob.mock.calls).toEqual([[SHELL_PID], [SHELL_PID]]);
    expect(h.written).toHaveLength(2);
  });

  it("対応外のシェル（fish・pwsh）と Windows のサーバは unsupported_agent_shell で何も書かない（AC9）", async () => {
    for (const exe of ["/usr/bin/fish", "pwsh"]) {
      const h = harness({ job: () => Promise.resolve(idleJob(exe)) });
      expect(await codeOf(h.starter.start(PARAMS))).toBe("unsupported_agent_shell");
      expect(h.written).toEqual([]);
    }
    const w = harness({ platform: "win32" });
    expect(await codeOf(w.starter.start(PARAMS))).toBe("unsupported_agent_shell");
    expect(w.written).toEqual([]);
    expect(w.foregroundJob).not.toHaveBeenCalled();
  });

  it("書き込みが失敗したら予約を解いて agent_start_input_failed", async () => {
    const h = harness({ writeFails: true });
    expect(await codeOf(h.starter.start(PARAMS))).toBe("agent_start_input_failed");
    expect(h.session.endAgentLaunch).toHaveBeenCalledWith("p1", 7);
  });
});
