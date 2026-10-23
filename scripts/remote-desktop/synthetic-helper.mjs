/** Synthetic desktop protocol source. Never captures a screen or sends OS input. */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createInterface } from "node:readline";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type),
    out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  label.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
export function reduceColor(r, g, b, mode = "full") {
  const q = (v, bits) => {
    const levels = (1 << bits) - 1;
    return Math.floor(
      (Math.floor((v * levels + 127) / 255) * 255 + Math.floor(levels / 2)) / levels,
    );
  };
  if (mode === "gray16") {
    const v = Math.floor((Math.floor((77 * r + 150 * g + 29 * b + 128) / 256) + 8) / 17) * 17;
    return [v, v, v];
  }
  if (mode === "rgb565") return [q(r, 5), q(g, 6), q(b, 5)];
  if (mode === "rgb332") return [q(r, 3), q(g, 3), q(b, 2)];
  return [r, g, b];
}
export function syntheticFrame(width, height, seq, color, mode = "full") {
  const captureStart = performance.now(),
    raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3,
        tile = Math.imul((x >>> 3) + (y >>> 3) * 319 + seq, 2654435761) >>> 0;
      raw[i] = tile & 255;
      raw[i + 1] = (tile >>> 8) & 255;
      raw[i + 2] = (tile >>> 16) & 255;
      if (
        color &&
        ((x >= 16 && x < 48 && y >= 16 && y < 48) ||
          (x >= width - 48 && x < width - 16 && y >= height - 48 && y < height - 16))
      ) {
        raw[i] = color[0];
        raw[i + 1] = color[1];
        raw[i + 2] = color[2];
      }
      if (mode !== "full")
        [raw[i], raw[i + 1], raw[i + 2]] = reduceColor(raw[i], raw[i + 1], raw[i + 2], mode);
    }
  const captureMs = performance.now() - captureStart,
    encodeStart = performance.now(),
    header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const image = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return {
    info: {
      seq,
      width,
      height,
      format: "image/png",
      captureMs,
      encodeMs: performance.now() - encodeStart,
      sourceCpuMs: (process.cpuUsage().user + process.cpuUsage().system) / 1000,
      sourceMemoryBytes: process.memoryUsage().rss,
    },
    data: image.toString("base64"),
  };
}
function heightOf(options) { return options.display?.height ?? Math.round(options.width * 9 / 16); }
function run() {
  let options,
    pending = 0,
    seq = 0,
    next = 0,
    lastSeen = performance.now(),
    control = false,
    forceFull = true,
    version = 0,
    sentVersion = -1,
    lastReport = 0,
    clipboard="",clipboardAllowed=false,clipboardGeneration=0;
  const allowInput = process.argv.includes("--allow-input");
  const markerAt = process.argv.indexOf("--unlock-marker");
  const unlockMarker = markerAt >= 0 ? process.argv[markerAt + 1] : undefined;
  const secure = process.argv.includes("--secure") && (!unlockMarker || !existsSync(unlockMarker));
  const coverAt = process.argv.indexOf("--cover-marker"), coverMarker = coverAt >= 0 ? process.argv[coverAt + 1] : undefined;
  const lockCover = secure && process.argv.includes("--lock-cover") && (!coverMarker || !existsSync(coverMarker));
  const recordAt = process.argv.indexOf("--record"),
    record = recordAt >= 0 ? process.argv[recordAt + 1] : undefined;
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("close", () => process.exit(0));
  lines.on("line", (line) => {
    try {
      const m = JSON.parse(line);
      if (m.type === "configure" && !options) {
        const failureAt = process.argv.indexOf("--startup-failure");
        if (failureAt >= 0) {
          const code = process.argv[failureAt + 1], markerAt = process.argv.indexOf("--startup-marker");
          const marker = markerAt >= 0 ? process.argv[markerAt + 1] : undefined;
          if (!marker || !existsSync(marker)) {
            if (marker) writeFileSync(marker, "retry");
            send({ type: "unlock_failure", code, message: "private native exception must not escape" });
            return;
          }
        }
        options = m.options;
        const modes = [{width:640,height:480},{width:800,height:600},{width:1024,height:768},{width:1280,height:720},{width:1600,height:900},{width:1920,height:1080}];
        const displayAllowed = !secure && process.argv.includes("--allow-display-resize") && m.allowDisplayResize === true;
        if (options.display) {
          if (!displayAllowed || !modes.some(mode => mode.width === options.display.width && mode.height === options.display.height)) throw Error("display not allowed");
          options = {...options, width:options.display.width};
        }
        send({
          type: "ready",
          ...(!process.argv.includes("--no-ime-keys") && (m.options.imeKeys === true || process.argv.includes("--unconditional-ime-keys")) ? {imeKeys:true} : {}),
          title: "Synthetic test source",
          allowInput,
          width: options.width,
          height: heightOf(options),
          backend: "synthetic",
          ...(secure ? {secureDesktop:true} : {}),
          ...(lockCover ? {lockScreenCover:true} : {}),
          ...(displayAllowed ? {display:{modes}} : {}),
          image: options.image ?? { colorMode: "full", showCursor: true },
          allowClipboard: !secure && process.argv.includes("--allow-clipboard") && m.allowClipboard===true, dynamicQuality:true,
        });
        const readyFailureAt=process.argv.indexOf("--ready-failure");
        const readyMarkerAt=process.argv.indexOf("--ready-marker"),readyMarker=readyMarkerAt>=0?process.argv[readyMarkerAt+1]:undefined;
        if(readyFailureAt>=0&&(!readyMarker||!existsSync(readyMarker))) {
          if(readyMarker)writeFileSync(readyMarker,"ended");
          // Fixed metadata only, modeling a worker that ends after its ready.
          send({type:"unlock_failure",code:process.argv[readyFailureAt+1],message:"private native failure"});
          // A parent's later transition may not overwrite the worker's fault.
          send({type:"unlock_failure",code:"source_transition"});
        }
      } else if (m.type === "heartbeat") lastSeen = performance.now();
      else if (m.type === "ack" && m.seq === pending) pending = 0;
      else if (m.type === "keyframe") {forceFull = true;next=0;}
      else if(m.type==="policy" && options){options={...options,fps:m.fps,quality:m.quality};next=0;}
      else if(m.type==="clipboard_control"){clipboardAllowed=m.enabled && process.argv.includes("--allow-clipboard");clipboardGeneration=m.generation;}
      else if(m.type==="clipboard"){
        let ok=clipboardAllowed && m.generation===clipboardGeneration && m.expiresAt>=Date.now();
        if(m.operation==="write"){ok=ok&&allowInput;if(ok)clipboard=m.text;send({type:"clipboard_result",id:m.id,ok});}
        else send({type:"clipboard_result",id:m.id,ok,...(ok?{text:clipboard}:{})});
      }
      else if (m.type === "control") {
        control = m.enabled && allowInput;
      } else if (m.type === "dismiss_lock_screen" && lockCover && control) {
        if (coverMarker) writeFileSync(coverMarker,"dismissed");
        send({type:"lock_screen_changed"});
        process.exit(0);
      } else if (m.type === "sas" && secure && control) {
        if (unlockMarker) writeFileSync(unlockMarker,"unlocked");
        send({type:"session_unlocked"});
        process.exit(0);
      } else if (m.type === "input" && control && m.expiresAt >= Date.now()) {
        if (process.argv.includes("--delta-test") && m.input.kind === "text") version++;
        if (record) appendFileSync(record, JSON.stringify(m.input) + "\n");
        if (!process.argv.includes("--stall-input")) send({ type: "input_ack", seq: m.seq });
      } else if (m.type === "stop") process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  setInterval(() => {
    if (performance.now() - lastSeen > 8000) process.exit(0);
    if (!options || lockCover || pending || performance.now() < next) return;
    const deltaTest = process.argv.includes("--delta-test"),
      stable = deltaTest || process.argv.includes("--static");
    const optimized = options.deltas && stable;
    if (optimized && !forceFull && sentVersion === version && performance.now() - lastReport < 1000)
      return;
    const baseSeq = seq;
    pending = ++seq;
    const color = reduceColor(
      ...(version % 2 ? [255, 0, 0] : [0, 255, 0]),
      options.image?.colorMode,
    );
    let frame;
    if (optimized && !forceFull && sentVersion !== version) {
      const patch = syntheticFrame(32, 32, 1, color); // Solid payload is generated explicitly below.
      const raw = Buffer.alloc((32 * 3 + 1) * 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          for (let k = 0; k < 3; k++) raw[y * 97 + 1 + x * 3 + k] = color[k];
      const header = Buffer.alloc(13);
      header.writeUInt32BE(32);
      header.writeUInt32BE(32, 4);
      header[8] = 8;
      header[9] = 2;
      const image = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
      ]);
      frame = {
        info: {
          ...patch.info,
          width: options.width,
          height: heightOf(options),
          update: {
            kind: "patch",
            baseSeq,
            patches: [
              { x: 16, y: 16, width: 32, height: 32, offset: 0, length: image.length },
              {
                x: options.width - 48,
                y: heightOf(options) - 48,
                width: 32,
                height: 32,
                offset: image.length,
                length: image.length,
              },
            ],
          },
        },
        data: Buffer.concat([image, image]).toString("base64"),
      };
    } else if (optimized && !forceFull && sentVersion === version) {
      frame = {
        info: {
          seq,
          width: options.width,
          height: heightOf(options),
          format: "image/png",
          captureMs: 0,
          encodeMs: 0,
          update: { kind: "unchanged", baseSeq },
        },
        data: "",
      };
    } else
      frame = syntheticFrame(
        options.width,
        heightOf(options),
        stable ? 1 : seq,
        deltaTest ? color : undefined,
        options.image?.colorMode,
      );
    if (optimized)
      frame.info.contentId = createHash("sha256")
        .update("static-" + version)
        .digest("hex");
    frame.info.seq = seq;
    forceFull = false;
    sentVersion = version;
    lastReport = performance.now();
    send({ type: "frame", ...frame });
    next = performance.now() + 1000 / options.fps;
  }, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
