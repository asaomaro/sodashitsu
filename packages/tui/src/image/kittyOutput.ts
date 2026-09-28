/**
 * 画像を外側の端末へ出し直す（Kitty graphics。外側が kitty・Ghostty・WezTerm のときだけ。20260927-cli-mode の design「image/」）。
 * 描くたびに「今見せる画像と位置」を渡し、変わったときだけ列を作る：前の置き方を全部外し（画像の中身は残す）、新しい画像を送り、置き直す。
 * 使わなくなった画像の中身は消す。画像は文字の下（`z=-1`）に置く——枠・知らせ・印の文字が上に出る。
 */

type Env = Readonly<Record<string, string | undefined>>;

/** 外側の端末が Kitty graphics を描けるか（tmux の中は素通しが当てにならないので使わない）。 */
export function kittyGraphicsSupported(env: Env): boolean {
  if (env["TMUX"]) return false;
  const term = env["TERM"] ?? "";
  const program = env["TERM_PROGRAM"] ?? "";
  return (
    term === "xterm-kitty" ||
    !!env["KITTY_WINDOW_ID"] ||
    program === "ghostty" ||
    term === "xterm-ghostty" ||
    !!env["GHOSTTY_RESOURCES_DIR"] ||
    program === "WezTerm"
  );
}

export interface KittyPlacement {
  /** 画像の中身を見分ける鍵（pane と画像の id）。 */
  imageKey: string;
  base64: string;
  /** 外側の端末の桁・行（0 始まり）。 */
  x: number;
  y: number;
  cols: number;
  rows: number;
}

const CHUNK = 4096;
const apc = (control: string, payload = ""): string =>
  `\x1b_G${control}${payload ? `;${payload}` : ""}\x1b\\`;

export class KittyImages {
  private readonly ids = new Map<string, number>();
  private nextId = 1;
  private shown = "";
  /** 一度でも出したか（終わるときに全部消す）。 */
  private used = false;

  /**
   * 今見せる画像。変わらなければ空文字列。`keep` はいま置かないが中身を残す画像の鍵（pane がまだ持つ画像。ダイアログを閉じたら送り直さずに置ける）。
   */
  sync(placements: readonly KittyPlacement[], keep: ReadonlySet<string> = new Set()): string {
    const sig = placements.map((p) => `${p.imageKey}@${p.x},${p.y},${p.cols}x${p.rows}`).join("|");
    if (sig === this.shown) return "";
    this.shown = sig;
    this.used = true;
    let out = "\x1b7" + apc("a=d,d=a,q=2"); // 置き方を全部外す（中身は残す）
    const wanted = new Set(placements.map((p) => p.imageKey));
    for (const [key, id] of [...this.ids]) {
      if (wanted.has(key) || keep.has(key)) continue;
      out += apc(`a=d,d=I,i=${id},q=2`); // 使わなくなった中身を消す
      this.ids.delete(key);
    }
    placements.forEach((p, i) => {
      let id = this.ids.get(p.imageKey);
      if (id === undefined) {
        id = this.nextId++;
        this.ids.set(p.imageKey, id);
        out += transmit(id, p.base64);
      }
      out += `\x1b[${p.y + 1};${p.x + 1}H`;
      out += apc(`a=p,i=${id},p=${i + 1},c=${p.cols},r=${p.rows},C=1,z=-1,q=2`);
    });
    return out + "\x1b8";
  }

  /** 外側の端末が画面を消した（2J）：次は全部送り直して置き直す。 */
  forget(): void {
    this.ids.clear();
    this.shown = "";
  }

  /** 全部消す（終わるとき）。何も出していなければ空。 */
  clear(): string {
    if (!this.used) return "";
    this.used = false;
    this.ids.clear();
    this.shown = "";
    return apc("a=d,d=A,q=2");
  }
}

/** 画像の中身を送る（PNG の base64 を 4096 文字ずつ。`m=1` は続きがある）。 */
function transmit(id: number, base64: string): string {
  let out = "";
  for (let i = 0; i < base64.length; i += CHUNK) {
    const part = base64.slice(i, i + CHUNK);
    const more = i + CHUNK < base64.length ? 1 : 0;
    out += i === 0 ? apc(`a=t,f=100,t=d,i=${id},q=2,m=${more}`, part) : apc(`m=${more}`, part);
  }
  return out;
}
