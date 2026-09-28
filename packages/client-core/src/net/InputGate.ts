import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import type { ConnectionPort, InputOrigin, LoginResult } from "./ports.js";

/** `InputGate.holdInput` の戻り値。保持を終える方法は 2 つ。 */
export interface InputHold {
  /**
   * 溜めた入力を、この pane（新しくできた pane）へ流して保持を終える。`first` は溜めた入力より前に流す（20260927-clipboard-image-paste：
   * 画像のパス・画像が無かったときの Ctrl+V の `0x16`）。保持が既に終わっていれば（時間切れ・2 度目の呼び出し）、`first` は普通の入力として今送る（失わない）。
   */
  release(toPaneId: string, first?: string | Uint8Array): void;
  /** 溜めた入力を、もともとの宛先（保持を始めたときに焦点のあった pane）へ流して保持を終える（要求が失敗した等）。`first` は `release` と同じ。 */
  cancel(first?: string | Uint8Array): void;
  /**
   * 溜めた入力を**捨てて**保持を終える（20260927-clipboard-image-paste：マシンを切り替えた——pane の id はマシンをまたいで重なるので、前のマシンの
   * pane へ打った文字を次のマシンの同じ id の pane へ流さない）。
   */
  discard(): void;
}

export interface InputGateOptions {
  /** 応答が来ないまま、この時間が過ぎたら、溜めた入力をもともとの宛先へ流す（入力を失わないため）。 */
  timeoutMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** フォーカスの報告（`CSI I`/`CSI O`）は、その pane 自身のもの——溜めて別の pane へ流してはいけない。 */
function isFocusReport(bytes: string | Uint8Array): boolean {
  return typeof bytes === "string" && (bytes === "\x1b[I" || bytes === "\x1b[O");
}

interface Hold {
  id: number;
  /** この保持が溜める宛先（保持を始めたときに焦点のあった pane。先の保持が終わるとその流し先も加わる）。 */
  sources: Set<string>;
  /** 溜めた入力（流し先が決まった後も、先の保持が終わるまでの間に届いたその流し先宛ての入力はここに並べる）。 */
  chunks: (string | Uint8Array)[];
  timer: unknown;
  /** 決まった流し先（`undefined` はまだ応答待ち、`null` は流さない）。 */
  target: string | null | undefined;
  /** 溜めた入力より前に流す列（`release`/`cancel` の `first`）。 */
  first: string | Uint8Array | undefined;
}

/**
 * 端末への入力の関所（D99。利用者の判断）。分割・新しい tab・新しい workspace のように「新しい pane へ焦点を移す」操作は、
 * サーバが新しい pane を作って応答を返すまで（シェルの起動確認の猶予を含めて約 0.3 秒）焦点を移せない。その間に打った
 * 文字は、放っておくと移動前の pane に入ってしまう。そこで、その操作の要求から応答までの間、移動前の pane 宛ての入力を
 * 溜めておき、新しい pane ができたらそこへ流す（tmux のように、操作の後に打った文字は新しい pane に届く）。
 *
 * `ConnectionPort` をそのまま包む（`sendInput` 以外は素通し）ので、`TerminalRegistry`（xterm.js の `onData`）・
 * `KeyInputController`（追加キーの列・prefix の二度押し等）のどちらの経路の入力も、ここ 1 か所で扱える。
 * 溜めないもの：他の pane 宛ての入力・フォーカスの報告・**ポインタ操作から出た入力**（マウスの報告・alt screen での
 * ホイールの矢印キーへの変換。`origin: "pointer"`）——元の pane の上での操作なので、新しいシェルへ流すと履歴の呼び出し等の
 * 意図しない入力になる（独立点検の指摘）。IME の変換中の文字は `onData` に出る前なので溜まらない（確定が応答の後なら
 * 元の pane に入る。既知の制約）。
 *
 * 保持が重なったとき（`prefix+v` を 2 回すばやく押す等）は、保持を順番に並べる。入力は一番新しい保持に溜め、流すのは
 * 古いほうから順に、流し先が決まったものだけ——打った順番と、どの操作の後に打ったかが保たれる。先の保持の流し先
 * （先の操作の新しい pane）は、後の保持が溜める宛先に加える（先の応答で焦点がそこへ移った後に打った文字も、後の操作の
 * 新しい pane へ届けるため）。
 */
export class InputGate implements ConnectionPort {
  private readonly holds: Hold[] = [];
  private seq = 0;
  private readonly timeoutMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    private readonly conn: ConnectionPort,
    opts: InputGateOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.setTimer = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    return this.conn.request(method, params);
  }

  login(token: string): Promise<LoginResult> {
    return this.conn.login(token);
  }

  logout(): Promise<void> {
    return this.conn.logout();
  }

  connect(): void {
    this.conn.connect();
  }

  sendInput(paneId: string, bytes: string | Uint8Array, origin?: InputOrigin): void {
    if (origin !== "pointer" && !isFocusReport(bytes)) {
      // 新しい保持から順に見る：応答待ちの保持なら溜める宛先か、流し先が決まって順番待ちの保持ならその流し先か。
      // 後者に並べるのは、後の操作の応答が先に来たとき、その pane へ直接送ると、まだ流していない古い溜め分を追い越すため。
      for (let i = this.holds.length - 1; i >= 0; i--) {
        const hold = this.holds[i]!;
        if (hold.target === undefined ? hold.sources.has(paneId) : hold.target === paneId) {
          hold.chunks.push(bytes);
          return;
        }
      }
    }
    this.conn.sendInput(paneId, bytes, origin);
  }

  /**
   * `sourcePaneId`（今、焦点のある pane）宛ての入力を溜め始める。`timeoutMs` はこの保持だけの時間切れ（既定は構築時の値。画像の送信は長いので 20 秒。
   * 20260927-clipboard-image-paste）。
   */
  holdInput(sourcePaneId: string | null, opts: { timeoutMs?: number } = {}): InputHold {
    const id = ++this.seq;
    const sources = new Set<string>();
    if (sourcePaneId) sources.add(sourcePaneId);
    const hold: Hold = { id, sources, chunks: [], timer: undefined, target: undefined, first: undefined };
    hold.timer = this.setTimer(() => this.finish(id, sourcePaneId), opts.timeoutMs ?? this.timeoutMs);
    this.holds.push(hold);
    return {
      release: (toPaneId, first) => this.finish(id, toPaneId, first),
      cancel: (first) => this.finish(id, sourcePaneId, first),
      discard: () => this.finish(id, null),
    };
  }

  private finish(id: number, target: string | null, first?: string | Uint8Array): void {
    const hold = this.holds.find((h) => h.id === id);
    if (!hold || hold.target !== undefined) {
      // 既に終わっている（時間切れで溜めた分は流した・2 度目の呼び出し。呼ぶ側は 1 度だけ終えること）。`first` は失わずに普通の入力として送る——溜めた分の後になるが、
      // まだ応答待ちの後の保持があればそこに並ぶ（`sendInput` の規則）。
      if (first !== undefined && target) this.sendInput(target, first);
      return;
    }
    this.clearTimer(hold.timer);
    hold.target = target;
    hold.first = first;
    // 焦点はこの流し先へ移る——まだ応答待ちの後の保持は、そこ宛ての入力も溜める。
    if (target) for (const later of this.holds) if (later.id > id && later.target === undefined) later.sources.add(target);
    // 古いほうから順に、流し先が決まったものだけ流す（打った順番を保つ）。
    while (this.holds[0] && this.holds[0].target !== undefined) {
      const done = this.holds.shift()!;
      if (!done.target) continue;
      if (done.first !== undefined) this.conn.sendInput(done.target, done.first);
      for (const chunk of done.chunks) this.conn.sendInput(done.target, chunk);
    }
  }
}
