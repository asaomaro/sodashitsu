import { Worker } from "node:worker_threads";
import { readFile, writeFile } from "node:fs/promises";
import { NodePtyBackend } from "./NodePtyBackend.js";
import type { PtyProcess, PtySpawnOptions } from "./PtyBackend.js";

/** 更新されないConPTY所有者。worker間のPTY識別子は再利用しない。 */
export async function runWindowsSupervisor(entry: URL, args: string[]): Promise<number> {
  const backend = new NodePtyBackend();
  const ptys = new Map<
    number,
    {
      pty: PtyProcess;
      owner: Worker;
      held: boolean;
      pending: string[];
      exitCode: number | undefined;
    }
  >();
  let nextFd = 3;
  let current: Worker;
  let replacing = false;
  let pendingStop: string | undefined;
  let stopping = false;
  let prepared: Worker | undefined;
  const protectedFds = new Set<number>();
  const deferredKills = new Set<number>();
  return new Promise<number>((resolve) => {
    const finish = (code: number): void => {
      if (stopping) return;
      stopping = true;
      for (const p of ptys.values()) p.pty.kill();
      ptys.clear();
      resolve(code);
    };
    const make = (nonce?: string, rollback = false): Worker => {
      const w = new Worker(entry, {
        argv: args,
        workerData: { sodaSupervisor: true, nonce, rollback },
      });
      w.on("message", (m: Record<string, any>) => {
        if (m.type === "pty") {
          const shared = m.result ? new Int32Array(m.result as SharedArrayBuffer) : null;
          try {
            let fd = Number(m.fd),
              pid = 0;
            if (m.op === "spawn") {
              if (w !== current) throw new Error("inactive worker");
              fd = nextFd++;
              if (fd > 65535) throw new Error("PTY identifier limit");
              const pty = backend.spawn(m.opts as PtySpawnOptions);
              pid = pty.pid;
              const p = {
                pty,
                owner: w,
                held: false,
                pending: [] as string[],
                exitCode: undefined as number | undefined,
              };
              ptys.set(fd, p);
              pty.onData((chunk) => {
                if (p.held) p.pending.push(chunk);
                else p.owner.postMessage({ type: "pty-data", fd, chunk });
              });
              pty.onExit((e) => {
                p.exitCode = e.exitCode;
                if (!p.held) p.owner.postMessage({ type: "pty-exit", fd, exitCode: e.exitCode });
              });
            } else {
              const p = ptys.get(fd);
              if (!p) throw new Error("unknown PTY");
              pid = p.pty.pid;
              if (m.op === "check") fd = p.exitCode === undefined ? 1 : 0;
              else if (m.op === "adopt") {
                if (m.pid !== pid) throw new Error("PTY pid mismatch");
                p.owner = w;
              } else if (p.owner !== w) throw new Error("PTY owner mismatch");
              else if (m.op === "pending") {
                fd = p.pty.pendingWriteBytes?.() ?? 0;
                pid = p.pty.pendingWriteChunks?.() ?? 0;
              } else if (m.op === "write") {
                p.pty.write(m.data as string | Uint8Array);
                w.postMessage({ type: "pty-written", fd });
              } else if (m.op === "resize") p.pty.resize(Number(m.cols), Number(m.rows));
              else if (m.op === "pause") p.pty.pause();
              else if (m.op === "hold") {
                p.held = true;
                p.pty.pause();
                w.postMessage({ type: "pty-held", fd });
              } else if (m.op === "resume") {
                p.held = false;
                for (const chunk of p.pending.splice(0))
                  w.postMessage({ type: "pty-data", fd, chunk });
                if (p.exitCode !== undefined)
                  w.postMessage({ type: "pty-exit", fd, exitCode: p.exitCode });
                else p.pty.resume();
              } else if (m.op === "kill") {
                if (w === prepared && protectedFds.has(fd)) deferredKills.add(fd);
                else {
                  p.pty.kill();
                  ptys.delete(fd);
                }
              }
            }
            if (shared) {
              if (m.op === "spawn" && !(pid > 0)) {
                const start = Date.now();
                const t = setInterval(() => {
                  const real = ptys.get(fd)?.pty.pid;
                  if (real && real > 0) {
                    clearInterval(t);
                    shared[1] = fd;
                    shared[2] = real;
                    Atomics.store(shared, 0, 1);
                    Atomics.notify(shared, 0);
                  } else if (Date.now() - start > 8000) {
                    clearInterval(t);
                    ptys.get(fd)?.pty.kill();
                    ptys.delete(fd);
                    Atomics.store(shared, 0, -1);
                    Atomics.notify(shared, 0);
                  }
                }, 10);
              } else {
                shared[1] = fd;
                shared[2] = pid;
                Atomics.store(shared, 0, 1);
                Atomics.notify(shared, 0);
              }
            }
          } catch {
            if (shared) {
              Atomics.store(shared, 0, -1);
              Atomics.notify(shared, 0);
            }
          }
        } else if (m.type === "preflight") {
          const probe = new Worker(entry, { argv: args, workerData: { sodaProbe: true } });
          let answered = false;
          const answer = (ok: boolean) => {
            if (answered) return;
            answered = true;
            clearTimeout(timer);
            w.postMessage({ type: "preflight-result", id: m.id, ok });
            void probe.terminate();
          };
          const timer = setTimeout(() => answer(false), 20_000);
          probe.once("message", (v) => answer(v?.type === "probe-ready"));
          probe.once("error", () => answer(false));
          probe.once("exit", () => answer(false));
        } else if (m.type === "replace" && w === current && !replacing) {
          replacing = true;
          let closedOld = false;
          let manifest: string | undefined;
          const backups = new Map<string, string>();
          void (async () => {
            // manifestはworkerが消費するので、失敗時に元workerへ戻すために私的メモリにも保持する。
            manifest = await readFile(String(m.path), "utf8");
            for (const p of JSON.parse(manifest).panes) protectedFds.add(p.fd);
            w.postMessage({ type: "close-for-replace" });
            const closeError = await new Promise<string | undefined>((r) => {
              // closeが終わる前に復旧を始めると、保存・lock解放と復旧が競合する。
              // 遅いcloseでもPTYを保持したまま完了を待つ。CLI側の待機期限とは分ける。
              const t = setTimeout(
                () => console.error("soda: waiting for the old Windows server to close"),
                30_000,
              );
              const on = (v: { type: string; error?: string }) => {
                if (v.type === "closed-for-replace") {
                  clearTimeout(t);
                  w.off("message", on);
                  r(v.error);
                }
              };
              w.on("message", on);
            });
            closedOld = true;
            if (closeError) throw new Error(closeError);
            for (const file of ["session.json", "graph.json"]) {
              const path = String(m.path).replace(/handoff\.json$/, file);
              try {
                backups.set(path, await readFile(path, "utf8"));
              } catch {}
            }
            await writeFile(
              String(m.path),
              JSON.stringify({ ...JSON.parse(manifest), createdAt: new Date().toISOString() }),
            );
            const candidate = make(String(m.nonce));
            prepared = candidate;
            current = candidate;
            const ready = await new Promise<boolean>((r) => {
              const t = setTimeout(() => r(false), 45_000);
              candidate.once("message", function on(v: { type: string }) {
                if (v.type === "server-ready") {
                  clearTimeout(t);
                  r(true);
                } else candidate.once("message", on);
              });
              candidate.once("error", () => {
                clearTimeout(t);
                r(false);
              });
              candidate.once("exit", () => {
                clearTimeout(t);
                r(false);
              });
            });
            if (ready) {
              for (const fd of protectedFds)
                if (ptys.get(fd)?.owner !== candidate) deferredKills.add(fd);
              for (const fd of deferredKills) {
                ptys.get(fd)?.pty.kill();
                ptys.delete(fd);
              }
              prepared = undefined;
              protectedFds.clear();
              deferredKills.clear();
              await w.terminate();
              replacing = false;
              if (pendingStop)
                current.postMessage({ type: "stop-supervised", signal: pendingStop });
              return;
            }
            await candidate.terminate();
            current = w;
            prepared = undefined;
            for (const [fd, p] of ptys) {
              if (protectedFds.has(fd)) {
                p.owner = w;
                p.held = true;
                p.pty.pause();
              } else if (p.owner === candidate) {
                p.pty.kill();
                ptys.delete(fd);
              }
            }
            protectedFds.clear();
            deferredKills.clear();
            for (const [path, data] of backups) await writeFile(path, data);
            await writeFile(
              String(m.path),
              JSON.stringify({ ...JSON.parse(manifest), createdAt: new Date().toISOString() }),
            );
            w.postMessage({
              type: "rollback-replace",
              nonce: String(m.nonce),
              error: "updated Windows server failed to start; restored the previous server",
            });
            replacing = false;
          })()
            .catch(async (e) => {
              console.error("soda: Windows handoff failed:", String(e));
              if (prepared) {
                await prepared.terminate();
                prepared = undefined;
              }
              current = w;
              for (const [fd, p] of ptys)
                if (protectedFds.has(fd)) {
                  p.owner = w;
                  p.held = true;
                  p.pty.pause();
                }
              deferredKills.clear();
              protectedFds.clear();
              if (closedOld && manifest) {
                for (const [path, data] of backups) await writeFile(path, data);
                await writeFile(
                  String(m.path),
                  JSON.stringify({ ...JSON.parse(manifest), createdAt: new Date().toISOString() }),
                );
                w.postMessage({
                  type: "rollback-replace",
                  nonce: String(m.nonce),
                  error: "Windows replacement failed; restored the previous server",
                });
              } else w.postMessage({ type: "replacement-error", message: String(e) });
              replacing = false;
            })
            .catch((e) => {
              // 状態ファイル自体を書き戻せないときも、ConPTY所有者は終了させない。
              console.error(
                "soda: Windows rollback could not restore state; live terminals remain held:",
                String(e),
              );
            });
        } else if (m.type === "server-ready" && w === current) {
          w.postMessage({ type: "commit-replace" });
          if (!replacing && pendingStop) {
            w.postMessage({ type: "stop-supervised", signal: pendingStop });
            pendingStop = undefined;
          }
          for (const [fd, p] of ptys)
            if (p.owner === w && p.held) {
              p.held = false;
              for (const chunk of p.pending.splice(0))
                w.postMessage({ type: "pty-data", fd, chunk });
              if (p.exitCode !== undefined)
                w.postMessage({ type: "pty-exit", fd, exitCode: p.exitCode });
              else p.pty.resume();
            }
        }
      });
      w.on("error", (e) => {
        console.error(e);
        if (w === current && !replacing) finish(1);
      });
      w.on("exit", (code) => {
        if (w === current && !replacing) finish(code);
      });
      return w;
    };
    current = make();
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
      process.on(signal, () => {
        if (replacing) pendingStop = signal;
        else current.postMessage({ type: "stop-supervised", signal });
      });
  });
}
