/**
 * ［操作する］の「押す直前に配置が動いていたら、押しを受けない」守り（20261008-display-layout PR-C のレビュー指摘 1・2）。
 *
 * プログラムが面を出し入れする（右のパネルを足す・窓を出し直す）と、利用者が押そうとしたボタンの位置に、**別のスクリプトの面の［操作する］**が来ることがある。
 * 押した結果、押したつもりの面と別の面が操作中になる（その後のキーは、その面のプログラムに届く）。これを、見える箱の動きで防ぐ:
 *
 * - **画面のどれか 1 つの［操作する］の箱（`getBoundingClientRect`）が、直前の 500ms の間に、動いた・現れた・消えた・別の面になった・覆いの下から出た／覆われた**ときは、
 *   **すべての［操作する］の本物の押し**（`pointerdown`・`mousedown`・`click`）を、ボタンへ届く前に（`window` の capture で）止める（押された 1 つのボタンだけを見ない。
 *   面が 1 つ消えて 1 つ現れる入れ替わり・隣の面だけが動いて、押す点の下の部品が替わる、も拾うため）。見える部分は、箱の 5 つの点（中心と四隅の内側）の最前面で見る。
 *   見回りが一度も見ていないボタンへの押しは、必ず『現れた』として受けない（出た直後の 500ms は、面が 1 つだけでも受けない）。割り付けの変化（`layoutRev`）には頼らない（割り付けの変化の出どころは、パネルの出し入れ・窓の領域・記憶・大きさ、と多い）。
 * - 止めたときは、ボタンを短く強調し（`onBlocked`）、短い知らせを出す。利用者がもう一度押せば（500ms 待てば）、押した面が操作中になる。
 * - 動いていないボタンは、遅れずに効く（500ms 待たせない）。キーの入口（`prefix+i`）は対象外（枠に出るのは利用者のキー）。
 * - `DisplayScriptMark.vue`・`engageEntry.ts` ほか守りのファイルは変えない。外側から、イベントを止めるだけ。
 */

export const ENGAGE_SETTLE_MS = 500;
/** 止めた押し始めの印を持ち越す期限（長押しの click は止めるが、後のキーボードの押しを落とさない）。 */
const PRESS_BLOCK_MS = 2000;
const BUTTON = "[data-display-engage]";
const SAMPLE_MS = 50;

interface Track {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 5 つの点（中心・四隅の内側）のうち、最前面がボタン自身の点の印（ビット）。 */
  vis: number;
  face: string | null;
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
  /** 見ているボタン（消えたことを見つけるため、強い参照で持つ。つながっていないものは、見つけたら捨てる）。 */
  const known = new Map<Element, Track>();
  /** 画面のどれかの［操作する］が、最後に、動いた・現れた・消えた・見え方が変わった時刻。 */
  let changedAt = -Infinity;

  function measure(el: Element): Track {
    const r = el.getBoundingClientRect();
    let vis = 0;
    if (r.width > 0 && r.height > 0) {
      const ins = Math.min(3, r.width / 4, r.height / 4);
      const pts: [number, number][] = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + ins, r.top + ins],
        [r.right - ins, r.top + ins],
        [r.left + ins, r.bottom - ins],
        [r.right - ins, r.bottom - ins],
      ];
      pts.forEach(([x, y], i) => {
        const hit = doc.elementFromPoint(x, y);
        if (hit !== null && (hit === el || el.contains(hit))) vis |= 1 << i;
      });
    }
    return { x: r.x, y: r.y, w: r.width, h: r.height, vis, face: el.closest("[data-display-root]")?.getAttribute("data-display-root") ?? null };
  }

  /** すべての［操作する］を測り直して、動き・現れ・消え・見え方の変化があれば、全体の時刻を更新する。`initial` は起動時の見回り（もともとあったものは「現れた」にしない）。 */
  function refreshAll(t: number, initial = false): void {
    const present = new Set<Element>(doc.querySelectorAll(BUTTON));
    for (const el of Array.from(known.keys())) {
      if (!present.has(el) || !el.isConnected) {
        known.delete(el);
        changedAt = t; // 消えた
      }
    }
    for (const el of present) {
      const cur = measure(el);
      const prev = known.get(el);
      known.set(el, cur);
      if (!prev) {
        if (!initial) changedAt = t; // 現れた
        continue;
      }
      const moved = Math.abs(prev.x - cur.x) > 0.5 || Math.abs(prev.y - cur.y) > 0.5 || Math.abs(prev.w - cur.w) > 0.5 || Math.abs(prev.h - cur.h) > 0.5;
      if (moved || prev.vis !== cur.vis || prev.face !== cur.face) changedAt = t;
    }
  }
  refreshAll(now(), true);
  const timer = win.setInterval(() => refreshAll(now()), SAMPLE_MS);

  /** 押し始め（`pointerdown`・`mousedown`）を止めた時刻。同じ押しの残り（`pointerup`・`click`）は、500ms を過ぎていても止める（長押しで抜けさせない）。期限つき。 */
  let pressBlockedAt = -Infinity;
  const onPress = (ev: Event): void => {
    if (!ev.isTrusted) return;
    if (o.isMobileSheet?.()) return;
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const el = target.closest(BUTTON);
    if (!el) return;
    const t = now();
    refreshAll(t);
    const starts = ev.type === "pointerdown" || ev.type === "mousedown";
    const settling = t - changedAt < ENGAGE_SETTLE_MS;
    const carried = !starts && t - pressBlockedAt < PRESS_BLOCK_MS;
    if (!settling && !carried) {
      if (starts) pressBlockedAt = -Infinity;
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const faceId = el.closest("[data-display-root]")?.getAttribute("data-display-root") ?? null;
    if (starts) {
      // 押し始めを止めたとき（click が出ない押し方でも、理由が分かるように）知らせる。同じ押しの click では、もう知らせない。
      if (ev.type === "pointerdown") {
        pressBlockedAt = t;
        o.onBlocked(faceId);
      }
      return;
    }
    if (ev.type === "click") {
      const already = carried;
      pressBlockedAt = -Infinity;
      if (!already) o.onBlocked(faceId); // キーボードの押し（押し始めが無い click）
    }
  };
  const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const;
  for (const ty of types) win.addEventListener(ty, onPress, true);
  return () => {
    win.clearInterval(timer);
    for (const ty of types) win.removeEventListener(ty, onPress, true);
    known.clear();
  };
}
