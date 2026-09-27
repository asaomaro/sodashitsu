import { KeyRouter, type Action, type Mode, type ResolvedKeymap } from "@sodashitsu/client-core";
import type { KeyInput } from "@sodashitsu/client-core";
import { encodeKey, type PaneInputModes } from "./encode.js";

export interface KeyTarget {
  /** 焦点の pane のモード（無ければ null＝送り先が無い）。 */
  paneModes(): PaneInputModes | null;
  sendToPane(bytes: string): void;
  dispatch(action: Action): void;
  /** 送り先が無くて捨てた打鍵（未接続の知らせを出す）。 */
  dropped?(): void;
}

/**
 * 分解したキーを client-core の `KeyRouter`（prefix の状態機械・割り当ての表）に通し、prefix 以外は焦点の pane へ送る
 * （20260927-cli-mode の design「入力」・architecture「input/keys.ts」）。prefix の後の prefix は prefix のバイト（既定 `\x02`）を送る（`KeyRouter` の `send`）。
 * モード（navigate・copy・resize）の解釈は 04 で `SubModeInterpreters` を渡す。
 */
export class TuiKeys {
  readonly router: KeyRouter;

  constructor(
    keymap: ResolvedKeymap,
    private readonly target: KeyTarget,
  ) {
    this.router = new KeyRouter(keymap, {
      now: () => Date.now(),
      setTimeout: (fn, ms) => {
        const t = setTimeout(fn, ms);
        t.unref?.();
        return t;
      },
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
  }

  get mode(): Mode {
    return this.router.mode;
  }

  setKeymap(keymap: ResolvedKeymap): void {
    this.router.setKeymap(keymap);
  }

  handle(ev: { key: KeyInput; raw: string }): void {
    const decision = this.router.handle(ev.key);
    switch (decision.kind) {
      case "pass": {
        const modes = this.target.paneModes();
        if (!modes) {
          this.target.dropped?.();
          return;
        }
        const bytes = encodeKey(ev, modes);
        if (bytes !== "") this.target.sendToPane(bytes);
        return;
      }
      case "send":
        if (this.target.paneModes()) this.target.sendToPane(decision.bytes);
        else this.target.dropped?.();
        return;
      case "action":
        this.target.dispatch(decision.action);
        return;
      case "consume":
        return;
    }
  }
}
