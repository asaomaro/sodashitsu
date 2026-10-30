import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { Transcription, readAudioFile, localTranscriptionOrigin } from "./transcription.js";

function fixture() {
  const pick = vi.fn(async () => "/generated/audio.wav");
  const read = vi.fn(async () => ({
    name: "audio.wav",
    mime: "audio/wav",
    bytes: new Uint8Array([1, 2, 3]),
  }));
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ text: "こんにちは、船長" }),
  );
  const changed = vi.fn();
  let now = 0;
  const service = new Transcription({ pick, read, fetch, changed, now: () => now });
  service.configure(true, "http://127.0.0.1:8080");
  return {
    service,
    pick,
    read,
    fetch,
    changed,
    now(value: number) {
      now = value;
    },
  };
}
it("sends reviewed audio to the configured agent without calling Whisper or importing fake transcript text",async()=>{
 const sendAudio=vi.fn(async()=>{}),fetch=vi.fn(),audio={name:"reviewed.wav",mime:"audio/wav",bytes:new Uint8Array([1,2,3])};
 const service=new Transcription({pick:async()=>"/generated/reviewed.wav",read:async()=>audio,changed:()=>{},fetch,sendAudio});
 service.configure(true,"http://127.0.0.1:8080","agent");expect(sendAudio).not.toHaveBeenCalled();
 await service.file();expect(sendAudio).toHaveBeenCalledWith(audio,expect.any(AbortSignal),expect.any(Number));expect(fetch).not.toHaveBeenCalled();
 expect(service.snapshot()).toMatchObject({status:"done",text:""});expect(service.snapshot().message).toContain("専用Codex");
});
it("never falls back to another provider when agent audio fails",async()=>{
 const fetch=vi.fn();const service=new Transcription({pick:async()=>"/generated.wav",read:async()=>({name:"a.wav",mime:"audio/wav",bytes:new Uint8Array([1])}),changed:()=>{},fetch,sendAudio:async()=>{throw Error("generated unsupported model");}});
 service.configure(true,"http://127.0.0.1:8080","agent");await service.file();
 expect(service.snapshot()).toMatchObject({status:"error",text:""});expect(service.snapshot().message).toContain("unsupported");expect(fetch).not.toHaveBeenCalled();
});
it("does not reset the original audio budget when a read exhausts it without running the timer",async()=>{
 let now=0;const sendAudio=vi.fn(async()=>{}),service=new Transcription({pick:async()=>"/generated.wav",read:async()=>{now=300001;return{name:"a.wav",mime:"audio/wav",bytes:new Uint8Array([1])};},changed:()=>{},now:()=>now,sendAudio});
 service.configure(true,"http://127.0.0.1:8080","agent");await service.file();
 expect(sendAudio).not.toHaveBeenCalled();expect(service.snapshot().status).toBe("error");expect(service.snapshot().message).toContain("期限");
});
it("requires explicit local configuration and refuses remote origins, credentials and paths", async () => {
  const pick = vi.fn();
  const service = new Transcription({ pick, changed() {} });
  await expect(service.file()).rejects.toThrow("有効");
  expect(pick).not.toHaveBeenCalled();
  for (const origin of [
    "https://example.test",
    "http://192.168.0.1:8080",
    "http://user:secret@localhost",
    "http://localhost/path",
    "http://localhost?token=x",
  ])
    expect(() => localTranscriptionOrigin(origin)).toThrow();
  expect(localTranscriptionOrigin("http://[::1]:8080/")).toBe("http://[::1]:8080");
});
it("posts only the explicitly selected audio to local whisper and returns preview text without calling an agent", async () => {
  const f = fixture();
  await f.service.file();
  expect(f.fetch).toHaveBeenCalledOnce();
  const [url, request] = f.fetch.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:8080/inference");
  expect(request).toMatchObject({ method: "POST", redirect: "error" });
  expect(request).not.toHaveProperty("headers");
  const form = request!.body as FormData;
  expect(form.get("response_format")).toBe("json");
  expect(form.get("language")).toBe("auto");
  expect(await (form.get("file") as File).arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  expect(f.service.snapshot()).toMatchObject({
    status: "done",
    text: "こんにちは、船長",
    name: "audio.wav",
  });
});
it("cancels a pending picker and a late inference response without reviving an old job", async () => {
  const f = fixture();
  let choose!: (path: string) => void;
  f.pick.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  const selecting = f.service.file();
  f.service.cancel();
  choose("/generated/audio.wav");
  await selecting;
  expect(f.fetch).not.toHaveBeenCalled();
  let respond!: (value: Response) => void;
  f.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const pending = f.service.file();
  await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
  f.service.cancel();
  respond(Response.json({ text: "old" }));
  await pending;
  expect(f.service.snapshot()).toMatchObject({ status: "idle", text: "" });
});
it("invalidates late results when the configured engine changes and refuses concurrent jobs", async () => {
  const f = fixture();
  let respond!: (value: Response) => void;
  f.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const pending = f.service.file();
  await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
  await expect(f.service.file()).rejects.toThrow("前の文字起こし");
  f.service.configure(true, "http://localhost:8081");
  respond(Response.json({ text: "old engine" }));
  await pending;
  expect(f.service.snapshot().text).toBe("");
});
it("enforces the monotonic inference budget even when a response arrives before the timer runs", async () => {
  const f = fixture();
  f.fetch.mockImplementationOnce(async () => {
    f.now(300_001);
    return Response.json({ text: "too late" });
  });
  await f.service.file();
  expect(f.service.snapshot()).toMatchObject({ status: "error", text: "" });
  expect(f.service.snapshot().message).toContain("5分");
});
it("bounds response bytes and treats invalid or unsuccessful inference as an error", async () => {
  for (const response of [
    Response.json({ text: "within text bound", padding: "x".repeat(1024 * 1024) }),
    Response.json({ text: 42 }),
    new Response("unavailable", { status: 503 }),
  ]) {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(response);
    await f.service.file();
    expect(f.service.snapshot()).toMatchObject({ status: "error", text: "" });
  }
});
it("reads only bounded nonempty selected audio files", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-transcription-audio-"));
  try {
    const path = join(root, "generated.wav");
    await writeFile(path, Buffer.from("generated-audio"));
    expect(await readAudioFile(path)).toMatchObject({ name: "generated.wav", mime: "audio/wav" });
    await expect(readAudioFile(join(root, "generated.html"))).rejects.toThrow("音声");
    await writeFile(path, "");
    await expect(readAudioFile(path).then(() => "accepted oversized audio")).rejects.toThrow(
      "25MB",
    );
    const handle = await open(path, "w");
    try {
      await handle.truncate(25 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    await expect(readAudioFile(path).then(() => "accepted oversized audio")).rejects.toThrow(
      "25MB",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects a nonregular audio path before opening it and rechecks the opened handle", async () => {
  const open = vi.fn(async () => {
    throw Error("must not open nonregular path");
  });
  const lstat = vi.fn(async () => ({ isFile: () => false, isSymbolicLink: () => false, size: 16 }));
  await expect(
    readAudioFile("/generated/fifo.wav", undefined, { open, lstat } as never),
  ).rejects.toThrow("通常ファイル");
  expect(open).not.toHaveBeenCalled();
  const close = vi.fn(async () => {}),
    read = vi.fn();
  const replaced = {
    lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 16 }),
    open: vi.fn(async () => ({
      stat: async () => ({ isFile: () => false, size: 0 }),
      read,
      close,
    })),
  };
  await expect(
    readAudioFile("/generated/replaced.wav", undefined, replaced as never),
  ).rejects.toThrow("通常ファイル");
  expect(read).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it("retains the one-operation slot while a cancelled read is still retiring", async () => {
  const f = fixture();
  let release!: (audio: Awaited<ReturnType<typeof f.read>>) => void;
  f.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.service.file();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  try {
    f.service.cancel();
    expect(f.service.snapshot().status).toBe("stopping");
    await expect(f.service.file()).rejects.toThrow("前の文字起こし");
  } finally {
    release({ name: "old.wav", mime: "audio/wav", bytes: new Uint8Array([1]) });
    await pending;
  }
  expect(f.service.snapshot().status).toBe("idle");
  expect(f.fetch).not.toHaveBeenCalled();
});

it("rejects a replaced identity and same-size edits while reading selected audio", async () => {
  for (const replaced of [true, false]) {
    const before = {
      isFile: () => true,
      isSymbolicLink: () => false,
      size: 3,
      dev: 1,
      ino: 2,
      mtimeMs: 100,
      ctimeMs: 100,
    };
    let reads = 0,
      stats = 0;
    const close = vi.fn(async () => {});
    const read = vi.fn(async (buffer: Buffer) => {
      if (reads++) return { bytesRead: 0 };
      buffer.write("abc");
      return { bytesRead: 3 };
    });
    const file = {
      read,
      close,
      stat: async () => ({
        ...before,
        ...(replaced ? { ino: 3 } : stats++ ? { mtimeMs: 200, ctimeMs: 200 } : {}),
      }),
    };
    await expect(
      readAudioFile("/generated/selected.wav", undefined, {
        lstat: async () => before,
        open: async () => file,
      } as never),
    ).rejects.toThrow("変更");
    expect(close).toHaveBeenCalledOnce();
    if (replaced) expect(read).not.toHaveBeenCalled();
    else expect(read).toHaveBeenCalled();
  }
});

it("uses real generated loopback HTTP multipart with no cookies and a neutral filename", async () => {
  let received = "";
  let cookie: string | undefined;
  let contentType = "";
  const server = createServer((request, response) => {
    cookie = request.headers.cookie;
    contentType = request.headers["content-type"] || "";
    request.on("data", (chunk) => {
      received += chunk.toString();
    });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ text: "generated inference result" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No generated HTTP port");
    const service = new Transcription({
      pick: async () => "/generated/audio.wav",
      read: async () => ({
        name: 'private unsafe ";file.wav',
        mime: "audio/wav",
        bytes: new Uint8Array([1, 2, 3]),
      }),
      changed() {},
    });
    service.configure(true, `http://127.0.0.1:${address.port}`);
    await service.file();
    expect(service.snapshot()).toMatchObject({
      status: "done",
      text: "generated inference result",
    });
    expect(cookie).toBeUndefined();
    expect(contentType).toContain("multipart/form-data;");
    expect(received).toContain('filename="audio.wav"');
    expect(received).not.toContain("private unsafe");
    expect(received).toContain('name="language"');
    expect(received).toContain('name="response_format"');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("does not follow an inference redirect even to another generated local endpoint", async () => {
  let forwarded = 0;
  const target = createServer((_request, response) => {
    ++forwarded;
    response.end(JSON.stringify({ text: "must not be read" }));
  });
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  const address = target.address();
  if (!address || typeof address === "string") throw Error("No generated target");
  const server = createServer((_request, response) => {
    response.writeHead(302, { Location: `http://127.0.0.1:${address.port}/redirected` });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const source = server.address();
    if (!source || typeof source === "string") throw Error("No generated source");
    const service = new Transcription({
      pick: async () => "/generated/audio.wav",
      read: async () => ({
        name: "audio.wav",
        mime: "audio/wav",
        bytes: new Uint8Array([1, 2, 3]),
      }),
      changed() {},
    });
    service.configure(true, `http://127.0.0.1:${source.port}`);
    await service.file();
    expect(service.snapshot().status).toBe("error");
    expect(forwarded).toBe(0);
  } finally {
    for (const item of [server, target]) {
      item.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        item.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});

it("transcribes explicitly submitted recordings without opening the file picker", async () => {
  const f = fixture(),
    key = randomUUID();
  await f.service.recorded(
    { name: "recording.webm", mime: "audio/webm;codecs=opus", bytes: new Uint8Array([1, 2, 3]) },
    key,
  );
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  expect(f.service.snapshot()).toMatchObject({ status: "done", text: "こんにちは、船長" });
  expect(f.service.cancel(key)).toBe(false);
});

it("cannot let an old recording cancel a later recording or file job", async () => {
  const f = fixture(),
    old = randomUUID(),
    next = randomUUID();
  let respond!: (value: Response) => void;
  f.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const pending = f.service.recorded(
    { name: "recording.webm", mime: "audio/webm", bytes: new Uint8Array([1]) },
    old,
  );
  await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
  try {
    expect(f.service.cancel(next)).toBe(false);
    expect(f.service.snapshot().status).toBe("transcribing");
    expect(f.service.cancel(old)).toBe(true);
  } finally {
    respond(Response.json({ text: "old" }));
    await pending;
  }
  await f.service.recorded(
    { name: "recording.webm", mime: "audio/webm", bytes: new Uint8Array([1]) },
    next,
  );
  expect(f.service.cancel(old)).toBe(false);
  expect(f.service.snapshot()).toMatchObject({ status: "done", text: "こんにちは、船長" });
});
