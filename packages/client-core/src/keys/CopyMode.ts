import type { Action, CopyCommand, KeyInput } from "./actions.js";
import type { SubModeInterpreter } from "./KeyRouter.js";

/**
 * copy モード（`prefix+[`）の解釈（architecture.md「keys/CopyMode.ts」・design「copy モード」）。
 * キー一覧は design.md の原文のとおり（D63。`0`・`^`・`$`・Home/End・`g`・`G`・`ctrl+b` は未確認のまま見送った）。
 * `Esc`（`clearOrExit`）はここでは抜けたと判断しない——選択・検索があるかは `CopyTarget`（T9）しか知らないので、
 * 実際に抜けるかどうかは `ActionDispatcher`（T18）が `CopyTarget.apply()` の結果を見て決める（D63）。
 *
 * **検索語の入力**（05-e2e-docs T4 で追加）：`/`・`?` は `searchStart` を返すだけでなく、続くキーを
 * 検索語として収集する内部状態（`searching`/`searchBuffer`）に入る——`CopyTarget.apply()` が受け取る
 * `searchInput`（`text` 付き）を実際に組み立てて送る経路が、03-web-desktop の時点では一度も無かった
 * （`toCommand` に `searchInput` を生成するキーが無いまま、`CopyTarget.ts` 側にだけ受け口があった。
 * `/` を押して文字を打っても、各文字が copy モードの移動キー（`b`＝単語を戻る 等）として解釈されるだけで
 * 検索が一切機能していなかった。実地の Playwright で発見。decisions.md D93）。
 * この状態機械のぶん、もう「副作用を持たない」とは言えなくなった（インスタンス内部の状態は持つ。
 * `CopyMode` は `main.ts` でシングルトンとして生成される——copy モードは同時に 1 pane でしか
 * 入れないため、インスタンスを跨いだ競合は起きない）。Enter で確定（空なら何もしない）・Escape で
 * 取り消す（どちらも copy モード自体からは抜けない。vim の `/` の挙動に合わせた）。
 */
export class CopyMode implements SubModeInterpreter {
  private searching = false;
  private searchBuffer = "";

  handle(k: KeyInput): { action?: Action; exit?: boolean } {
    if (this.searching) return this.handleSearchInput(k);
    const cmd = this.toCommand(k);
    if (!cmd) return {};
    if (cmd.op === "searchStart") this.searching = true;
    const action: Action = { type: "copy", cmd };
    if (cmd.op === "yank" || cmd.op === "exit") return { action, exit: true };
    return { action };
  }

  private handleSearchInput(k: KeyInput): { action?: Action; exit?: boolean } {
    if (k.ctrl || k.alt || k.meta) return {}; // 装飾キーは無視する（暴発防止）
    if (k.key === "Enter") {
      this.searching = false;
      const text = this.searchBuffer;
      this.searchBuffer = "";
      return text ? { action: { type: "copy", cmd: { op: "searchInput", text } } } : {};
    }
    if (k.key === "Escape") {
      this.searching = false;
      this.searchBuffer = "";
      return {};
    }
    if (k.key === "Backspace") {
      this.searchBuffer = this.searchBuffer.slice(0, -1);
      return {};
    }
    if (k.key.length === 1) this.searchBuffer += k.key; // 印字可能な 1 文字だけを集める
    return {};
  }

  private toCommand(k: KeyInput): CopyCommand | null {
    if (k.ctrl) {
      switch (k.key) {
        case "f":
          return { op: "move", unit: "page", dir: 1 };
        case "u":
          return { op: "move", unit: "halfPage", dir: -1 };
        case "d":
          return { op: "move", unit: "halfPage", dir: 1 };
        default:
          return null;
      }
    }
    switch (k.key) {
      case "h":
        return { op: "move", unit: "char", dir: -1 };
      case "l":
        return { op: "move", unit: "char", dir: 1 };
      case "j":
        return { op: "move", unit: "line", dir: 1 };
      case "k":
        return { op: "move", unit: "line", dir: -1 };
      case "w":
        return { op: "move", unit: "word", dir: 1 };
      case "b":
        return { op: "move", unit: "word", dir: -1 };
      case "e":
        return { op: "move", unit: "wordEnd", dir: 1 };
      case "W":
        return { op: "move", unit: "WORD", dir: 1 };
      case "B":
        return { op: "move", unit: "WORD", dir: -1 };
      case "E":
        return { op: "move", unit: "WORDEnd", dir: 1 };
      case "{":
        return { op: "move", unit: "paragraph", dir: -1 };
      case "}":
        return { op: "move", unit: "paragraph", dir: 1 };
      case "PageUp":
        return { op: "move", unit: "page", dir: -1 };
      case "PageDown":
        return { op: "move", unit: "page", dir: 1 };
      case "/":
        return { op: "searchStart", dir: 1 };
      case "?":
        return { op: "searchStart", dir: -1 };
      case "n":
        return { op: "searchNext", reverse: false };
      case "N":
        return { op: "searchNext", reverse: true };
      case "v":
      case " ":
        return { op: "selectStart", linewise: false };
      case "V":
        return { op: "selectStart", linewise: true };
      case "y":
      case "Enter":
        return { op: "yank" };
      case "q":
        return { op: "exit" };
      case "Escape":
        return { op: "clearOrExit" };
      default:
        return null;
    }
  }
}
