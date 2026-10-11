import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import ts from "typescript";
import { expect, it } from "vitest";

it("IPC中の未送信量を数え、分割したUTF8バイトを保持し、holdの前の出力を渡す", async () => {
  const source = await readFile(new URL("./WorkerPtyBackend.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const worker = new Worker(
    new URL(
      "data:text/javascript," +
        encodeURIComponent(
          js +
            `
    const backend = new WorkerPtyBackend();
    const pty = backend.spawn({});
    const data=[];pty.onData(x=>data.push(x));
    pty.write(new Uint8Array([0xe3]));pty.write(new Uint8Array([0x81,0x82]));
    parentPort.postMessage({type:'counts',bytes:pty.pendingWriteBytes(),chunks:pty.pendingWriteChunks()});
    parentPort.on('message',async m=>{if(m.type==='inspect'){
      const held=await pty.holdReading();
      parentPort.postMessage({type:'done',bytes:pty.pendingWriteBytes(),chunks:pty.pendingWriteChunks(),held,data});
    }});
  `,
        ),
    ),
  );
  const writes: Uint8Array[] = [];
  try {
    const done = await new Promise<{
      bytes: number;
      chunks: number;
      held: boolean;
      data: string[];
    }>((resolve, reject) => {
      worker.on("error", reject);
      worker.on("message", (m) => {
        if (m.type === "pty") {
          if (m.op === "write") writes.push(m.data);
          if (m.op === "hold") {
            worker.postMessage({ type: "pty-data", fd: 3, chunk: "before hold" });
            worker.postMessage({ type: "pty-held", fd: 3 });
          }
          if (m.result) {
            const a = new Int32Array(m.result);
            a[1] = m.op === "spawn" ? 3 : 0;
            a[2] = m.op === "spawn" ? 123 : 0;
            Atomics.store(a, 0, 1);
            Atomics.notify(a, 0);
          }
        } else if (m.type === "counts") {
          expect(m.bytes).toBe(3);
          expect(m.chunks).toBe(2);
          worker.postMessage({ type: "pty-written", fd: 3 });
          worker.postMessage({ type: "pty-written", fd: 3 });
          worker.postMessage({ type: "inspect" });
        } else if (m.type === "done") resolve(m);
      });
    });
    expect(writes.map((x) => Array.from(x))).toEqual([[0xe3], [0x81, 0x82]]);
    expect(done).toMatchObject({ bytes: 0, chunks: 0, held: true, data: ["before hold"] });
  } finally {
    await worker.terminate();
  }
}, 15000);
