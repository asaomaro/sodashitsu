import { describe, expect, it } from "vitest";
import {
  BRIDGE_FRAME,
  BridgeFrameDecoder,
  encodeBridgeFrame,
  encodeJson,
  markerBytes,
} from "./bridgeFrames.js";
import {
  classifyLinkFailure,
  LINK_TIMEOUTS,
  MachineLink,
  type LinkEnd,
  type LinkFailure,
} from "./MachineLink.js";
import { SSH_OPTIONS, sshArgsFor } from "./sshArgs.js";
import { FakeChild, flush, ManualClock } from "./testing.js";

const PROFILE = {
  id: "0123456789abcdef0123456789abcdef",
  label: "Build",
  target: "you@build",
  enabled: true,
};
const helloFrame = (): Uint8Array =>
  encodeBridgeFrame(
    BRIDGE_FRAME.HELLO,
    0,
    encodeJson({ bridge: 1, protocol: 1, version: "0.1.0", hostname: "build", sessionName: null }),
  );

function setup(profile: typeof PROFILE & { session?: string } = PROFILE) {
  const clock = new ManualClock();
  const children: FakeChild[] = [];
  const link = new MachineLink(profile, {
    clock,
    spawn: (cmd, args) => {
      const c = new FakeChild(cmd, args);
      children.push(c);
      return c;
    },
  });
  const events: string[] = [];
  const failures: LinkFailure[] = [];
  link.onOnline(() => events.push("online"));
  link.onClosed((f) => {
    events.push("closed");
    failures.push(f);
  });
  link.start();
  return { link, clock, child: children[0]!, events, failures };
}

function sentFrames(child: FakeChild) {
  return new BridgeFrameDecoder({ role: "endpoint" }).push(child.allWritten());
}

describe("sshArgs（T6）", () => {
  it("非対話のオプション・`--`・宛先・固定のコマンドだけ。session は検証済みの名前だけ足す", () => {
    expect(sshArgsFor({ target: "you@build" })).toEqual([
      ...SSH_OPTIONS,
      "--",
      "you@build",
      "soda",
      "bridge",
    ]);
    expect(sshArgsFor({ target: "ssh://b:2222", session: "agents" })).toEqual([
      ...SSH_OPTIONS,
      "--",
      "ssh://b:2222",
      "soda",
      "bridge",
      "--session",
      "agents",
    ]);
    expect(SSH_OPTIONS).toContain("BatchMode=yes");
    expect(SSH_OPTIONS).toContain("NumberOfPasswordPrompts=0");
    expect(SSH_OPTIONS).not.toContain("StrictHostKeyChecking=yes");
    expect(() => sshArgsFor({ target: "-oProxyCommand=touch /tmp/x" })).toThrow(
      /invalid ssh target/,
    );
    expect(() => sshArgsFor({ target: "host;rm -rf ~" })).toThrow(/invalid ssh target/);
    expect(() => sshArgsFor({ target: "host", session: "a;b" })).toThrow(/invalid remote session/);
    expect(() => sshArgsFor({ target: "host", session: "$(id)" })).toThrow(
      /invalid remote session/,
    );
  });
});

describe("MachineLink（T6）", () => {
  it("ssh を引数の配列で起こし、目印の前のゴミを読み捨てて HELLO で online になる。チャネルは 1 から増え再利用しない", async () => {
    const { link, child, events } = setup({ ...PROFILE, session: "agents" });
    expect(child.command).toBe("ssh");
    expect(child.args.slice(-6)).toEqual([
      "--",
      "you@build",
      "soda",
      "bridge",
      "--session",
      "agents",
    ]);
    child.stdout.write(Buffer.from("Welcome!\n"));
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    expect(events).toEqual(["online"]);
    expect(link.hello).toMatchObject({ hostname: "build" });
    const a = link.openChannel()!;
    const b = link.openChannel()!;
    expect([a.id, b.id]).toEqual([1, 2]);
    a.close(1000, "");
    expect(link.openChannel()!.id).toBe(3);
    await flush();
    expect(sentFrames(child).map((f) => [f.type, f.channel])).toEqual([
      [BRIDGE_FRAME.OPEN, 1],
      [BRIDGE_FRAME.OPEN, 2],
      [BRIDGE_FRAME.CLOSE, 1],
      [BRIDGE_FRAME.OPEN, 3],
    ]);
  });

  it("チャネルの送受信: TEXT/BINARY を届け、リモートの CLOSE で閉じる。書き込み待ちはチャネルごとに数え、流れたら 0 に戻る", async () => {
    const { link, child } = setup();
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    const ch = link.openChannel()!;
    const got: string[] = [];
    const closes: number[] = [];
    ch.onText((s) => got.push(s));
    ch.onBinary((b) => got.push(`bin:${b.byteLength}`));
    ch.onClose((code) => closes.push(code));
    ch.sendText('{"id":"1"}');
    expect(ch.pendingBytes).toBeGreaterThan(0);
    await flush();
    expect(ch.pendingBytes).toBe(0);
    child.stdout.write(
      Buffer.from(
        encodeBridgeFrame(
          BRIDGE_FRAME.TEXT,
          ch.id,
          new TextEncoder().encode('{"id":"1","result":{}}'),
        ),
      ),
    );
    child.stdout.write(
      Buffer.from(encodeBridgeFrame(BRIDGE_FRAME.BINARY, ch.id, new Uint8Array(3))),
    );
    child.stdout.write(
      Buffer.from(encodeBridgeFrame(BRIDGE_FRAME.TEXT, 99, new TextEncoder().encode("{}"))),
    ); // 閉じた・無いチャネルは捨てる
    child.stdout.write(
      Buffer.from(
        encodeBridgeFrame(BRIDGE_FRAME.CLOSE, ch.id, encodeJson({ code: 1008, reason: "x" })),
      ),
    );
    await flush();
    expect(got).toEqual(['{"id":"1","result":{}}', "bin:3"]);
    expect(closes).toEqual([1008]);
  });

  it("64 本を超えるチャネルは開かない。online でなければ開かない", async () => {
    const { link, child } = setup();
    expect(link.openChannel()).toBeUndefined();
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    for (let i = 0; i < 64; i++) expect(link.openChannel()).toBeDefined();
    expect(link.openChannel()).toBeUndefined();
  });

  it("HELLO が 20 秒で来なければ transient で切り、ssh を止める", async () => {
    const { clock, child, events, failures } = setup();
    clock.advance(LINK_TIMEOUTS.helloMs);
    expect(events).toEqual(["closed"]);
    expect(failures[0]).toMatchObject({
      kind: "transient",
      message: expect.stringMatching(/時間切れ/),
    });
    expect(child.kills[0]).toBe("SIGTERM");
  });

  it("黙って 15 秒で PING、最後に受けてから 45 秒で切る（確かめは 1 秒ごと・最後に受けた時刻から数える）", async () => {
    const { clock, child, events, failures } = setup();
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    clock.advance(LINK_TIMEOUTS.pingIntervalMs - 1000);
    await flush();
    expect(sentFrames(child).filter((f) => f.type === BRIDGE_FRAME.PING)).toHaveLength(0);
    clock.advance(1000);
    await flush();
    expect(sentFrames(child).filter((f) => f.type === BRIDGE_FRAME.PING)).toHaveLength(1);
    clock.advance(1000); // 送った直後に続けて送らない
    await flush();
    expect(sentFrames(child).filter((f) => f.type === BRIDGE_FRAME.PING)).toHaveLength(1);
    // 何か受けたら、そこから 45 秒（HELLO の直後に 1 バイト受けた場合を含め、上限の超過を遅らせない）
    child.stdout.write(Buffer.from(encodeBridgeFrame(BRIDGE_FRAME.PONG, 0, new Uint8Array(1))));
    await flush();
    clock.advance(LINK_TIMEOUTS.silenceMs - 1000);
    expect(events).toEqual(["online"]);
    clock.advance(1000);
    expect(events).toEqual(["online", "closed"]);
    expect(failures[0]).toMatchObject({
      kind: "transient",
      message: expect.stringMatching(/生きているか/),
    });
  });

  it("SIGTERM で終わらない ssh は 2 秒後に SIGKILL。時間切れの後に close が来ても報告は 1 回だけ", async () => {
    const clock = new ManualClock();
    let child!: FakeChild;
    const failures: LinkFailure[] = [];
    const link = new MachineLink(PROFILE, {
      clock,
      spawn: (cmd, args) => {
        child = new FakeChild(cmd, args);
        child.kill = (signal) => {
          child.kills.push(signal);
          if (signal === "SIGKILL") child.exit(null, "SIGKILL");
          return true;
        };
        return child;
      },
    });
    link.onClosed((f) => failures.push(f));
    link.start();
    clock.advance(LINK_TIMEOUTS.helloMs);
    expect(child.kills).toEqual(["SIGTERM"]);
    clock.advance(LINK_TIMEOUTS.killGraceMs);
    expect(child.kills).toEqual(["SIGTERM", "SIGKILL"]);
    await flush();
    await flush();
    expect(failures).toHaveLength(1);
  });

  it("ssh が無い（spawn の ENOENT が 'error'→'close' で届く）は要対応を 1 回だけ", async () => {
    const clock = new ManualClock();
    const failures: LinkFailure[] = [];
    const link = new MachineLink(PROFILE, {
      clock,
      spawn: (cmd, args) => {
        const c = new FakeChild(cmd, args);
        setImmediate(() => {
          c.emit("error", Object.assign(new Error("spawn ssh ENOENT"), { code: "ENOENT" }));
          c.exit(-2);
        });
        return c;
      },
    });
    link.onClosed((f) => failures.push(f));
    link.start();
    await flush();
    await flush();
    expect(failures).toEqual([
      { kind: "attention", message: expect.stringMatching(/ssh が見つかりません/) },
    ]);
  });

  it("標準エラーのかたまりの境目で切れた多バイト文字を化けさせない", async () => {
    const { child, failures } = setup();
    const msg = Buffer.from("接続できません: Permission denied (publickey).\n");
    child.stderr.write(msg.subarray(0, 4)); // 「接」の途中で切る
    child.stderr.write(msg.subarray(4));
    child.exit(255);
    await flush();
    await flush();
    expect(failures[0]!.message).toContain("接続できません");
    expect(failures[0]!.message).not.toContain("\ufffd");
  });

  it("枠の違反・2 回目の HELLO・HELLO の前のチャネルの枠は切る。閉じたらチャネルは 1012 で閉じる", async () => {
    const bad = setup();
    bad.child.stdout.write(
      Buffer.concat([markerBytes(), Buffer.from(Uint8Array.of(0x02, 0, 0, 0, 1, 0, 0, 0, 0))]),
    );
    await flush();
    expect(bad.failures[0]).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/対応していません/),
    });

    const twice = setup();
    twice.child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    const ch = twice.link.openChannel()!;
    const codes: number[] = [];
    ch.onClose((c) => codes.push(c));
    twice.child.stdout.write(Buffer.from(helloFrame()));
    await flush();
    expect(twice.failures[0]).toMatchObject({
      kind: "transient",
      message: expect.stringMatching(/second hello/),
    });
    expect(codes).toEqual([1012]);

    const early = setup();
    early.child.stdout.write(
      Buffer.concat([
        markerBytes(),
        Buffer.from(encodeBridgeFrame(BRIDGE_FRAME.TEXT, 1, new Uint8Array(0))),
      ]),
    );
    await flush();
    expect(early.failures[0]).toMatchObject({ kind: "attention" });
  });

  it("ssh が終われば分類を 1 回だけ報告する。close() は transient「閉じました」", async () => {
    const auth = setup();
    auth.child.stderr.write("you@build: Permission denied (publickey).\n");
    auth.child.exit(255);
    await flush();
    await flush();
    expect(auth.failures).toEqual([
      { kind: "attention", message: expect.stringMatching(/認証に失敗.*Permission denied/) },
    ]);

    const own = setup();
    own.link.close();
    await flush();
    expect(own.failures).toEqual([{ kind: "transient", message: "接続を閉じました" }]);
  });
});

describe("classifyLinkFailure（T6。判定の順）", () => {
  const base: LinkEnd = {
    exitCode: null,
    signal: null,
    stderr: "",
    spawnError: undefined,
    protocolError: undefined,
    preambleOverflow: false,
    sawMarker: false,
    sawHello: false,
    timeout: undefined,
    closedByUs: false,
  };
  const c = (o: Partial<LinkEnd>) => classifyLinkFailure({ ...base, ...o });

  it("HELLO の前", () => {
    expect(c({ spawnError: Object.assign(new Error("x"), { code: "ENOENT" }) })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/ssh が見つかりません/),
    });
    expect(c({ exitCode: 255, stderr: "Host key verification failed.\n" })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/ホスト鍵/),
    });
    expect(c({ exitCode: 255, stderr: "Permission denied (publickey)." })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/認証/),
    });
    expect(c({ exitCode: 127, stderr: "bash: soda: command not found" })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/soda が見つかりません/),
    });
    expect(c({ exitCode: 3, stderr: "soda: no running soda serve" })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/動いていません/),
    });
    expect(c({ exitCode: 0, protocolError: "unexpected frame type 2" })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/対応していません/),
    });
    expect(c({ preambleOverflow: true })).toMatchObject({ kind: "attention" });
    expect(c({ exitCode: 2, stderr: "soda: unknown command: bridge" })).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/中継を始められません/),
    });
    expect(
      c({ exitCode: 255, stderr: "ssh: connect to host build port 22: Connection refused" }),
    ).toMatchObject({ kind: "transient", message: expect.stringMatching(/Connection refused/) });
    // 初期化ファイルの雑音（not found）が前にあっても、終わり際が unknown command なら「soda が無い」ではなく非互換
    expect(
      c({
        exitCode: 2,
        stderr:
          "sh: 1: nvm: not found\nbash: ~/.cargo/env: No such file or directory\nx\ny\nsoda: unknown command: bridge\nhint",
      }),
    ).toMatchObject({
      kind: "attention",
      message: expect.stringMatching(/中継を始められません/),
    });
    expect(c({ timeout: "hello" })).toMatchObject({ kind: "transient" });
  });

  it("HELLO の後はどの終了コードでも transient（リモートの soda serve が止まって bridge が 0 で終わる等）", () => {
    for (const exitCode of [0, 1, 2, 3, 127, 255])
      expect(
        c({ sawMarker: true, sawHello: true, exitCode, stderr: "Permission denied" }).kind,
      ).toBe("transient");
    expect(c({ sawHello: true, timeout: "health" })).toMatchObject({
      kind: "transient",
      message: expect.stringMatching(/生きているか/),
    });
  });

  it("標準エラーの制御文字を取り除き 200 文字で切る", () => {
    const f = c({ exitCode: 255, stderr: `\u001b[31m${"x".repeat(300)}\u0007\n\n` });
    expect(f.message).not.toMatch(/[\u0000-\u001f]/);
    expect(f.message.length).toBeLessThan(260);
  });
});

describe("MachineLink.exited（引き継ぎの前に子の終わりを待つ）", () => {
  it("ssh の子の close で解決する。起こせなかったときは閉じた時点で解決する", async () => {
    const { link, child } = setup();
    let done = false;
    void link.exited.then(() => (done = true));
    link.close();
    await flush();
    await flush();
    expect(child.exited).toBe(true);
    expect(done).toBe(true);
    const failed = new MachineLink(
      { ...PROFILE, target: "-bad" },
      { clock: new ManualClock(), spawn: () => expect.unreachable() as never },
    );
    failed.start();
    await expect(failed.exited).resolves.toBeUndefined();
  });
});

describe("MachineLink.holdReading（背圧）", () => {
  it("理由が 1 つでもあれば ssh の標準出力を止め、全部外れたら再開する", async () => {
    const { link, child } = setup();
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    link.holdReading("a");
    link.holdReading("b");
    expect(child.stdout.isPaused()).toBe(true);
    link.releaseReading("a");
    expect(child.stdout.isPaused()).toBe(true);
    link.releaseReading("b");
    expect(child.stdout.isPaused()).toBe(false);
    link.releaseReading("zzz"); // 知らない理由は何もしない
    expect(child.stdout.isPaused()).toBe(false);
  });

  it("読むのを止めている間は沈黙に数えない（45 秒で健全な接続を切らない）", async () => {
    const { link, child, clock, events } = setup();
    child.stdout.write(Buffer.concat([markerBytes(), helloFrame()]));
    await flush();
    link.holdReading("a");
    clock.advance(LINK_TIMEOUTS.silenceMs * 2);
    expect(events).toEqual(["online"]);
    link.releaseReading("a");
    clock.advance(LINK_TIMEOUTS.silenceMs);
    expect(events).toEqual(["online", "closed"]); // 再開した後は今までどおり
  });
});
