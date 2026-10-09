/**
 * ［操作する］の「押す直前に配置が動いていたら、押しを受けない」守り（20261008-display-layout PR-C のレビュー指摘 1・2）。
 *
 * プログラムが面を出し入れする（右のパネルを足す・窓を出し直す）と、利用者が押そうとしたボタンの位置に、**別のスクリプトの面の［操作する］**が来ることがある。
 * 押した結果、押したつもりの面と別の面が操作中になる（その後のキーは、その面のプログラムに届く）。これを、見える箱の動きで防ぐ:
 *
 * - **ボタンの画面上の箱（`getBoundingClientRect`）が、直前の 500ms の間に動いた・現れた・別の部品の下から出てきた**ときは、本物の押し（`pointerdown`・`mousedown`・`click`）を、
 *   ボタンへ届く前に（`window` の capture で）止める。割り付けの変化（`layoutRev`）には頼らない（割り付けの変化の出どころは、パネルの出し入れ・窓の領域・記憶・大きさ、と多い）。
 * - 止めたときは、ボタンを短く強調し（`onBlocked`）、短い知らせを出す。利用者がもう一度押せば（500ms 待てば）、押した面が操作中になる。
 * - 動いていないボタンは、遅れずに効く（500ms 待たせない）。キーの入口（`prefix+i`）は対象外（枠に出るのは利用者のキー）。
 * - `DisplayScriptMark.vue`・`engageEntry.ts` ほか守りのファイルは変えない。外側から、イベントを止めるだけ。
 */

export const ENGAGE_SETTLE_MS = 500;
const BUTTON = "[data-display-engage]";
const SAMPLE_MS = 50;

interface Track {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 見えていた（中心の点の最前面が、ボタン自身）か。 */
  visible: boolean;
  /** 最後に、動いた・現れた・見えるようになった時刻。 */
  changedAt: number;
}

export interface EngageGuardOptions {
  /** 止めたとき: ボタンの面の id（`data-display-root`）。強調と知らせに使う。 */
  onBlocked(faceId: string | null): void;
  /** モバイル（重ね表示）では働かせない。 */
  isMobileSheet?: () => boolean;
  now?: () => number;
}

export function installEngageGuard(o: EngageGuardOptions, win: Window = window): () => void {
  const doc = win.document;
  const now = o.now ?? ((): number => Date.now());
  const tracks = new WeakMap<Element, Track>();

  function isVisible(el: Element, r: DOMRect): boolean {
    if (r.width <= 0 || r.height <= 0) return false;
    const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  }

  /** ボタンの箱を測り直して、動いたら時刻を更新する。初めて見るボタンは、ほかにも［操作する］があるときだけ「現れた」とする（面が 1 つだけのふつうの操作を待たせない）。 */
  function refresh(el: Element, t: number): Track {
    const r = el.getBoundingClientRect();
    const vis = isVisible(el, r);
    const cur = tracks.get(el);
    if (!cur) {
      const others = doc.querySelectorAll(BUTTON).length > 1;
      const first: Track = { x: r.x, y: r.y, w: r.width, h: r.height, visible: vis, changedAt: others ? t : -Infinity };
      tracks.set(el, first);
      return first;
    }
    const moved = Math.abs(cur.x - r.x) > 0.5 || Math.abs(cur.y - r.y) > 0.5 || Math.abs(cur.w - r.width) > 0.5 || Math.abs(cur.h - r.height) > 0.5;
    const emerged = !cur.visible && vis;
    if (moved || emerged) cur.changedAt = t;
    cur.x = r.x;
    cur.y = r.y;
    cur.w = r.width;
    cur.h = r.height;
    cur.visible = vis;
    return cur;
  }

  const timer = win.setInterval(() => {
    const t = now();
    for (const el of Array.from(doc.querySelectorAll(BUTTON))) refresh(el, t);
  }, SAMPLE_MS);

  /** 押し始め（`pointerdown`・`mousedown`）を止めたら、同じ押しの残り（`pointerup`・`click`）も、500ms を過ぎていても止める（長押しで抜けさせない）。 */
  let pressBlocked = false;
  const onPress = (ev: Event): void => {
    if (!ev.isTrusted) return;
    if (o.isMobileSheet?.()) return;
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const el = target.closest(BUTTON);
    if (!el) return;
    const t = now();
    const tr = refresh(el, t);
    const starts = ev.type === "pointerdown" || ev.type === "mousedown";
    const settling = t - tr.changedAt < ENGAGE_SETTLE_MS;
    if (starts) pressBlocked = settling;
    if (!settling && !(pressBlocked && !starts)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (ev.type === "click") {
      pressBlocked = false;
      o.onBlocked(el.closest("[data-display-root]")?.getAttribute("data-display-root") ?? null);
    }
  };
  const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const;
  for (const ty of types) win.addEventListener(ty, onPress, true);
  return () => {
    win.clearInterval(timer);
    for (const ty of types) win.removeEventListener(ty, onPress, true);
  };
}
