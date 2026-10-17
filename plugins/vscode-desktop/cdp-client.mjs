/** No VSCode selectors, evaluate, startup switches or OS input. Also usable with a pipe-backed test session. */
export class CdpCapture {
  constructor(cdp, { frame, stopped = () => {}, now = () => Date.now() }) {
    this.cdp = cdp;
    this.frame = frame;
    this.stopped = stopped;
    this.now = now;
    this.running = false;
    this.control = false;
    this.pending = false;
    this.lastFrame = -Infinity;
    this.seq = 0;
    this.keys = new Map();
    this.buttons = new Set();
    this.queue = Promise.resolve();
    this.queued = 0;
    this.inputItems = [];
    this.inputWorker = undefined;
    this.epoch = 0;
    this.frameGeneration = 0;
    this.viewportQueued = false;
    this.inputBlocked = false;
  }
  async start() {
    this.running = true;
    this.off = this.cdp.onEvent((method, params) => {
      if (method === "Page.screencastFrame") void this.onFrame(params);
      if (
        method === "Inspector.detached" ||
        (method === "Page.frameNavigated" && !params.frame.parentId)
      )
        void this.stop("対象の画面が変わりました。再接続してください");
    });
    try {
      await this.cdp.send("Page.enable");
      if (!this.running) return;
      await this.startScreencast();
    } catch (e) {
      await this.stop("画面取得を開始できません");
      throw e;
    }
  }
  async startScreencast() {
    await this.cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 80,
        maxWidth: 1920,
        maxHeight: 1200,
        everyNthFrame: 1,
      });
  }
  async onFrame(p) {
    // Retain the latest image even while waiting for the viewer. A page can stop
    // repainting immediately after this event; dropping it would leave stale pixels.
    try {
      if (!this.running || this.capturePaused || typeof p.data !== "string" || p.data.length > 3 * 1024 * 1024) return;
      this.latest = { data: p.data, generation: this.frameGeneration };
      await this.flush();
    } finally {
      await this.cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
    }
  }
  async flush() {
    if (!this.running || this.pending || !this.latest) return;
    const delay = 100 - (this.now() - this.lastFrame);
    if (delay > 0) {
      if (!this.frameTimer) {
        this.frameTimer = setTimeout(() => { this.frameTimer = undefined; void this.flush(); }, delay);
        this.frameTimer.unref?.();
      }
      return;
    }
    this.pending = true;
    const { data, generation } = this.latest;
    this.pendingSent = false;
    this.pendingGeneration = generation;
    this.latest = undefined;
    try {
      const metrics = await this.cdp.send("Page.getLayoutMetrics");
      const view = metrics.cssVisualViewport;
      if (!this.running) return;
      if (generation !== this.frameGeneration) {
        // No viewer ACK exists for this unsent image. Preserve ACK state only
        // when an old image was actually sent before reconfiguration.
        if (!this.pendingSent && this.pendingGeneration === generation) this.pending = false;
        void this.flush();
        return;
      }
      const width = Math.ceil(view?.clientWidth ?? 0), height = Math.ceil(view?.clientHeight ?? 0);
      if (width < 1 || height < 1 || width > 32768 || height > 32768) throw new Error("unsupported viewport");
      this.width = width; this.height = height; this.lastFrame = this.now();
      this.pendingSent = true;
      this.frame({ type: "frame", seq: ++this.seq, width, height, data });
    } catch { await this.stop("画面取得が終了しました"); }
  }
  ack(seq) {
    if (seq !== this.seq || !this.pending || !this.pendingSent) return;
    this.pending = false;
    if (this.pendingGeneration === this.frameGeneration && !this.capturePaused) {
      this.awaitingFrameGeneration = undefined;
      this.inputBlocked = this.viewportQueued || this.viewportRequest !== undefined;
    }
    void this.flush();
  }
  async setControl(enabled) {
    this.control = enabled === true && this.running;
    const epoch = ++this.epoch;
    const enable = this.control;
    this.discardInputs();
    if (!enable) {
      this.viewportRequest = undefined;
      // Cancelled requests never changed coordinates. An applied change still
      // needs a fresh image ACK, including after clearing its override.
      this.inputBlocked = this.viewportQueued || this.awaitingFrameGeneration !== undefined;
    }
    // Electron may not acknowledge mouse input to an inactive native window.
    // Serialize focus emulation before input; revoke it when control is released.
    this.queue = this.queue.then(async () => {
      if (enable) {
        if (!this.running || !this.control || epoch !== this.epoch) return;
        this.focusEmulated = true;
        await this.cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      } else {
        await this.release();
        if (this.viewportApplied) await this.changeViewport(null);
        await this.releaseFocus();
      }
    }).catch(() => { void this.stop("操作のフォーカスを設定できませんでした"); });
    await this.queue;
  }
  setViewport(size) {
    if (size !== null && (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) ||
        size.width < 160 || size.width > 4096 || size.height < 120 || size.height > 2400))
      return Promise.resolve();
    if (!this.running || !this.control) return Promise.resolve();
    // One queued worker and one latest request bound resize bursts independently
    // of the number of ResizeObserver notifications.
    this.viewportRequest = size === null ? null : { width: size.width, height: size.height };
    this.inputBlocked = true;
    this.discardInputs();
    if (this.viewportQueued) return this.queue;
    this.viewportQueued = true;
    const epoch = this.epoch;
    this.queue = this.queue.then(async () => {
      while (this.running && this.control && epoch === this.epoch && this.viewportRequest !== undefined) {
        const desired = this.viewportRequest;
        this.viewportRequest = undefined;
        await this.release();
        await this.changeViewport(desired);
      }
    }).catch(() => { void this.stop("表示サイズを変更できませんでした"); })
      .finally(() => {
        this.viewportQueued = false;
        this.inputBlocked = this.awaitingFrameGeneration !== undefined || this.viewportRequest !== undefined;
        if (this.running && this.control && this.viewportRequest !== undefined)
          void this.setViewport(this.viewportRequest);
      });
    return this.queue;
  }
  async changeViewport(size) {
    this.capturePaused = true;
    this.awaitingFrameGeneration = ++this.frameGeneration;
    this.inputBlocked = true;
    clearTimeout(this.frameTimer); this.frameTimer = undefined; this.latest = undefined;
    await this.cdp.send("Page.stopScreencast");
    if (size === null) {
      await this.cdp.send("Emulation.clearDeviceMetricsOverride");
      this.viewportApplied = false;
    } else {
      // A command can take effect even when its response is lost. Always try to
      // clear it on stop after we have attempted to set it.
      this.viewportApplied = true;
      await this.cdp.send("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 0, mobile: false });
    }
    if (!this.running) return;
    this.capturePaused = false;
    await this.startScreencast();
  }
  async releaseFocus() {
    if (!this.focusEmulated) return;
    this.focusEmulated = false;
    await this.cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
  }
  discardInputs() {
    this.inputItems.length = 0;
    this.inputItems = [];
    this.inputWorker = undefined;
    this.queued = 0;
  }
  input(value) {
    if (!this.running || !this.control || this.inputBlocked || !inputCommand(value, this.width, this.height))
      return Promise.resolve();
    const continuous = (v) => v.kind === "pointer" && ["mouseMoved", "mouseWheel"].includes(v.event);
    const last = this.inputItems.at(-1);
    const samePointer = last && last.epoch === this.epoch && value.kind === "pointer" &&
      last.value.kind === "pointer" && value.event === last.value.event &&
      ["button", "buttons", "modifiers", "clickCount"].every(k => value[k] === last.value[k]);
    if (samePointer && value.event === "mouseMoved") {
      last.value = { ...value };
    } else if (samePointer && value.event === "mouseWheel" && value.x === last.value.x && value.y === last.value.y &&
        ["deltaX", "deltaY"].every(k => !value[k] || !last.value[k] || Math.sign(value[k]) === Math.sign(last.value[k]))) {
      // Never queue an unbounded amount of scrolling. Saturate each compatible
      // pending burst at one legal CDP delta; extreme excess is intentionally lost.
      for (const axis of ["deltaX", "deltaY"])
        last.value[axis] = Math.max(-10000, Math.min(10000, last.value[axis] + value[axis]));
    } else {
      if (this.inputItems.length >= 128) {
        if (continuous(value)) return this.queue;
        const expendable = this.inputItems.findIndex(item => continuous(item.value));
        if (expendable < 0) return this.stop("入力が混雑したため共有を停止しました");
        this.inputItems.splice(expendable, 1);
      }
      this.inputItems.push({ value: { ...value }, epoch: this.epoch });
    }
    this.queued = this.inputItems.length;
    if (this.inputWorker) return this.queue;
    const items = this.inputItems, worker = {};
    this.inputWorker = worker;
    this.queue = this.queue.then(async () => {
      while (items.length) {
        const { value, epoch } = items.shift();
        if (items === this.inputItems) this.queued = items.length;
        if (!this.running || !this.control || this.inputBlocked || epoch !== this.epoch) continue;
        const command = inputCommand(value, this.width, this.height);
        if (!command) continue;
        if (value.kind === "key") {
          if (value.event === "keyDown")
            this.keys.set(value.code, { key: value.key, code: value.code });
          else this.keys.delete(value.code);
        }
        if (value.kind === "pointer") {
          this.point = { x: value.x, y: value.y };
          if (value.event === "mousePressed") this.buttons.add(value.button);
          if (value.event === "mouseReleased") this.buttons.delete(value.button);
        }
        await this.cdp.send(command.method, command.params);
      }
    }).catch(() => { void this.stop("入力に失敗しました"); })
      .finally(() => { if (this.inputWorker === worker) this.inputWorker = undefined; });
    return this.queue;
  }
  async release() {
    const actions = [...this.keys.values()].map((v) =>
      this.cdp
        .send("Input.dispatchKeyEvent", { type: "keyUp", ...v, modifiers: 0 })
        .catch(() => {}),
    );
    for (const button of this.buttons)
      actions.push(
        this.cdp
          .send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            button,
            ...this.point,
            buttons: 0,
            modifiers: 0,
            clickCount: 1,
          })
          .catch(() => {}),
      );
    this.keys.clear();
    this.buttons.clear();
    await Promise.all(actions);
  }
  stop(reason = "共有を停止しました") {
    if (this.stopping) return this.stopping;
    if (!this.running) return Promise.resolve();
    this.running = false;
    this.control = false;
    this.discardInputs();
    clearTimeout(this.frameTimer); this.frameTimer = undefined; this.latest = undefined;
    ++this.epoch;
    this.off?.();
    this.viewportRequest = undefined;
    this.stopping = this.cleanup(reason);
    return this.stopping;
  }
  async cleanup(reason) {
    // Queue error handlers fire stop without awaiting it, so cleanup can wait
    // for an in-flight override and clear it before closing the CDP connection.
    await this.queue;
    await this.release();
    if (this.viewportApplied) {
      await this.cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
      this.viewportApplied = false;
    }
    await this.releaseFocus();
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    this.stopped(reason);
  }
}
const finite = (n, min, max) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const keyCodes = {
  Enter: 13,
  Tab: 9,
  Backspace: 8,
  Escape: 27,
  Delete: 46,
  Insert: 45,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Meta: 91,
  " ": 32,
};
export function inputCommand(v, width, height) {
  if (!v || typeof v !== "object") return null;
  if (v.kind === "text")
    return typeof v.text === "string" && v.text.length > 0 && v.text.length <= 8192
      ? { method: "Input.insertText", params: { text: v.text } }
      : null;
  if (!Number.isInteger(v.modifiers) || !finite(v.modifiers, 0, 15)) return null;
  if (v.kind === "key") {
    if (
      !["keyDown", "keyUp"].includes(v.event) ||
      typeof v.key !== "string" ||
      v.key.length > 64 ||
      typeof v.code !== "string" ||
      v.code.length > 64 ||
      typeof v.repeat !== "boolean"
    )
      return null;
    const virtualKey =
      keyCodes[v.key] ??
      (/^F([1-9]|1[0-9]|2[0-4])$/.test(v.key)
        ? 111 + Number(v.key.slice(1))
        : /^[a-z0-9]$/i.test(v.key)
          ? v.key.toUpperCase().charCodeAt(0)
          : 0);
    const text =
      v.event === "keyDown" && !(v.modifiers & 7)
        ? v.key.length === 1
          ? v.key
          : v.key === "Enter"
            ? "\r"
            : ""
        : "";
    return {
      method: "Input.dispatchKeyEvent",
      params: {
        type: v.event,
        key: v.key,
        code: v.code,
        modifiers: v.modifiers,
        autoRepeat: v.repeat,
        windowsVirtualKeyCode: virtualKey,
        text,
      },
    };
  }
  if (
    v.kind !== "pointer" ||
    !["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"].includes(v.event) ||
    !finite(v.x, 0, width - 0.001) ||
    !finite(v.y, 0, height - 0.001) ||
    !["none", "left", "right", "middle"].includes(v.button) ||
    !Number.isInteger(v.buttons) ||
    !finite(v.buttons, 0, 7) ||
    !Number.isInteger(v.clickCount) ||
    !finite(v.clickCount, 0, 3) ||
    !finite(v.deltaX, -10000, 10000) ||
    !finite(v.deltaY, -10000, 10000)
  )
    return null;
  return {
    method: "Input.dispatchMouseEvent",
    params: {
      type: v.event,
      x: v.x,
      y: v.y,
      button: v.button,
      buttons: v.buttons,
      modifiers: v.modifiers,
      clickCount: v.clickCount,
      ...(v.event === "mouseWheel" ? { deltaX: v.deltaX, deltaY: v.deltaY } : {}),
    },
  };
}

export class CdpSocket {
  constructor(socket) {
    this.socket = socket;
    this.serial = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener("message", (e) => {
      let m;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error("CDP command failed: " + m.error.code));
        else p.resolve(m.result ?? {});
      } else if (m.method)
        for (const listener of this.listeners) listener(m.method, m.params ?? {});
    });
    socket.addEventListener("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("CDP disconnected"));
      }
      this.pending.clear();
      for (const listener of this.listeners) listener("Inspector.detached", {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        ws.close();
        reject(new Error("CDP connection timed out"));
      }, 5000);
      ws.addEventListener(
        "open",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          reject(new Error("CDP connection failed"));
        },
        { once: true },
      );
    });
    return new CdpSocket(ws);
  }
  send(method, params = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP disconnected"));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP command timed out"));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close() {
    this.socket.close();
  }
}
