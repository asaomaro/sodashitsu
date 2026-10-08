import {
  DisplayCloseParams,
  DisplayFeaturesParams,
  DisplayListParams,
  DisplaySendParams,
  DisplaySetParams,
  EXTENSION_DISPLAYS_MAX,
  EXTENSION_DISPLAY_BYTES_MAX,
  EXTENSION_PROTOCOL_VERSION,
  EXT_EVENT_TYPES,
  RpcError,
  extLimits,
  type DisplayFeatures,
  type DisplaySource,
  type ExtLine,
  type ExtPane,
  type ExtRequest,
  type ExtensionScope,
} from "@sodashitsu/protocol";
import { z } from "zod";
import type { DisplayOwner, DisplayService } from "../display/DisplayService.js";
import type { Logger } from "../log/Logger.js";

/**
 * 拡張が呼べる操作の表（20261007-ext-host）。1 行ごと・同期。行の解釈と壊れた行の数え方は `ExtensionProcess`（処理の順の 1）。ここは 2〜8。
 * **このファイルは設定（`prefs`）を読まない・変えない**: `script-html` の設定の検査は、台帳（`DisplayService`）が `set`・`send` の中で、ほかの呼び手と同じ入口で行う。
 * 拡張が `script-html` を出せる条件は「登録の `allow`」（ここが台帳の前に見る。欠ければ `unsupported`）かつ「サーバの設定」（台帳が見る。欠ければ `display_script_disabled`）。
 */

/** 操作を呼ぶ拡張（起動 1 回ぶん）。 */
export interface ApiExtension {
  key: string;
  id: string;
  scope: ExtensionScope;
  root: string | null;
  runId: string;
  /** 面の札（起動 1 回ごと）。 */
  tag: string;
  allow: readonly string[];
  onUnresponsive: "pass" | "block";
}

export interface ExtensionApiDeps {
  displays: Pick<DisplayService, "set" | "close" | "list" | "send" | "features" | "ownerOf" | "countOwned" | "bytesOwned">;
  /** その拡張に見せる pane（範囲の中だけ）。 */
  panes(ext: ApiExtension): ExtPane[];
  /** その拡張が、その pane を扱えるか。pane が無ければ false。 */
  inScope(ext: ApiExtension, paneId: string): boolean;
  logger: Pick<Logger, "warn">;
}

const SCRIPT_HTML = "script-html";
const EMPTY = z.object({});
const METHODS_ALWAYS = ["ext.features", "ext.panes", "display.set", "display.close", "display.list", "display.features"] as const;

function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}
type Outcome = { ok: true; result: unknown } | { ok: false; code: string; message: string };

export function ownerOf(ext: ApiExtension): DisplayOwner {
  const source: DisplaySource = { type: "extension", id: ext.id, scope: ext.scope };
  return { tag: ext.tag, source };
}

export function createExtensionApi(deps: ExtensionApiDeps) {
  const mayScript = (ext: ApiExtension): boolean => ext.allow.includes(SCRIPT_HTML);

  /** `allow` で絞った機能（登録の上で使えるもの。設定には依らない）と、設定のいまの値（`allow` が無ければ、いつも false）。 */
  function displayFeatures(ext: ApiExtension): DisplayFeatures {
    const f = deps.displays.features();
    const allowed = mayScript(ext);
    return {
      ...f,
      features: allowed ? [...f.features] : f.features.filter((x) => x !== `format:${SCRIPT_HTML}` && x !== "send"),
      scriptEnabled: allowed && f.scriptEnabled === true,
    };
  }

  function methods(ext: ApiExtension): string[] {
    return mayScript(ext) ? [...METHODS_ALWAYS, "display.send"] : [...METHODS_ALWAYS];
  }

  function helloLine(ext: ApiExtension): ExtLine {
    const f = displayFeatures(ext);
    return {
      type: "ext.hello",
      v: EXTENSION_PROTOCOL_VERSION,
      runId: ext.runId,
      extension: { id: ext.id, scope: ext.scope, ...(ext.root !== null ? { root: ext.root } : {}) },
      allow: [...ext.allow],
      onUnresponsive: ext.onUnresponsive,
      methods: methods(ext),
      events: [...EXT_EVENT_TYPES],
      display: { features: f.features, scriptEnabled: f.scriptEnabled === true, limits: f.limits },
      limits: extLimits(),
    };
  }

  function parse<T extends z.ZodType>(schema: T, params: unknown): { ok: true; value: z.infer<T> } | ReturnType<typeof fail> {
    const r = schema.safeParse(params ?? {});
    if (r.success) return { ok: true, value: r.data };
    const path = r.error.issues[0]?.path.map(String).join(".") ?? "";
    return fail("invalid_params", path === "" ? "invalid params" : `invalid params: ${/^[A-Za-z0-9_.-]{1,64}$/.test(path) ? path : "(field)"}`);
  }

  function run(ext: ApiExtension, req: ExtRequest): Outcome {
    // 2. 表で引く。
    const method = req.method;
    const table = ["ext.features", "ext.panes", "display.set", "display.close", "display.list", "display.features", "display.send"];
    if (!table.includes(method)) {
      const shown = method.length <= 64 && /^[A-Za-z0-9_.:-]+$/.test(method) ? `: ${method}` : "";
      return fail("unsupported", `この操作は使えません${shown}`);
    }
    // 3. 引数の検査 → 4. 範囲 → 5. 許可 → 6. 数と量 → 7. 台帳。
    const owner = ownerOf(ext);
    switch (method) {
      case "ext.features": {
        const p = parse(EMPTY, req.params);
        if (!p.ok) return p;
        return { ok: true, result: { methods: methods(ext), events: [...EXT_EVENT_TYPES], display: displayFeatures(ext), limits: extLimits() } };
      }
      case "ext.panes": {
        const p = parse(EMPTY, req.params);
        if (!p.ok) return p;
        return { ok: true, result: { panes: deps.panes(ext) } };
      }
      case "display.features": {
        const p = parse(DisplayFeaturesParams, req.params);
        if (!p.ok) return p;
        return { ok: true, result: displayFeatures(ext) };
      }
      case "display.set": {
        const p = parse(DisplaySetParams, req.params);
        if (!p.ok) return p;
        const { paneId, ...body } = p.value;
        if (!deps.inScope(ext, paneId)) return fail("not_found", `pane not found: ${paneId}`);
        if (body.format === SCRIPT_HTML && !mayScript(ext)) return fail("unsupported", "script-html はこの拡張の登録（allow）で許可されていません");
        const limit = checkLimits(ext, paneId, body);
        if (limit !== null) return limit;
        return { ok: true, result: deps.displays.set(paneId, body, { owner }) };
      }
      case "display.close": {
        const p = parse(DisplayCloseParams, req.params);
        if (!p.ok) return p;
        if (!deps.inScope(ext, p.value.paneId)) return fail("not_found", `pane not found: ${p.value.paneId}`);
        return { ok: true, result: deps.displays.close(p.value.paneId, p.value, "closed", { owner: ext.tag }) };
      }
      case "display.list": {
        const p = parse(DisplayListParams, req.params);
        if (!p.ok) return p;
        if (!deps.inScope(ext, p.value.paneId)) return fail("not_found", `pane not found: ${p.value.paneId}`);
        const { displays } = deps.displays.list(p.value.paneId, { owner: ext.tag });
        return { ok: true, result: { displays } };
      }
      default: {
        // display.send
        const p = parse(DisplaySendParams, req.params);
        if (!p.ok) return p;
        if (!deps.inScope(ext, p.value.paneId)) return fail("not_found", `pane not found: ${p.value.paneId}`);
        if (!mayScript(ext)) return fail("unsupported", "script-html はこの拡張の登録（allow）で許可されていません");
        return { ok: true, result: deps.displays.send(p.value.paneId, { name: p.value.name, data: p.value.data }, { owner: ext.tag }) };
      }
    }
  }

  /** 6. 1 つの拡張の面の数（16）と中身の合計（8 MiB）。台帳の上限（サーバ全体）を、1 つの拡張が使い切らないように。 */
  function checkLimits(ext: ApiExtension, paneId: string, body: { name?: unknown; content?: unknown }): ReturnType<typeof fail> | null {
    const name = typeof body.name === "string" ? body.name : undefined;
    const mine = name !== undefined && deps.displays.ownerOf(paneId, name) === ext.tag;
    if (!mine && deps.displays.countOwned(ext.tag) >= EXTENSION_DISPLAYS_MAX) {
      return fail("display_limit", `この拡張が出せる面は ${EXTENSION_DISPLAYS_MAX} 個までです`);
    }
    if (typeof body.content === "string") {
      // 置き換える自分の面のバイト数は引く（差で数える）。ほかの持ち主の面のバイト数は引かない。
      const old = mine ? (deps.displays.list(paneId, { owner: ext.tag }).displays.find((d) => d.name === name)?.bytes ?? 0) : 0;
      const next = deps.displays.bytesOwned(ext.tag) - old + Buffer.byteLength(body.content, "utf8");
      if (next > EXTENSION_DISPLAY_BYTES_MAX) return fail("display_limit", "この拡張が出せる面の中身の合計の上限を超えます（8 MiB）");
    }
    return null;
  }

  /** 1 行の要求を処理する。`id` が無ければ（誤りのときも）`null`（返事を書かない）。全体を `try/catch`。 */
  function handle(ext: ApiExtension, req: ExtRequest): ExtLine | null {
    let out: Outcome;
    try {
      out = run(ext, req);
    } catch (err) {
      if (err instanceof RpcError) out = fail(err.code, err.message);
      else {
        deps.logger.warn("extension api failed", { extension: ext.key, kind: err instanceof Error ? err.constructor.name : typeof err });
        out = fail("internal", "internal error");
      }
    }
    if (req.id === undefined) return null;
    return out.ok
      ? { type: "ext.result", id: req.id, ok: true, result: out.result }
      : { type: "ext.result", id: req.id, ok: false, error: { code: out.code, message: out.message } };
  }

  return { handle, helloLine, displayFeatures };
}
export type ExtensionApi = ReturnType<typeof createExtensionApi>;
