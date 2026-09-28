/**
 * CSS の色の文字列を RGB へ読む（色の上書き〔`themeOverrides`〕を端末版で描くため。web はブラウザの CSS が読む）。
 * 読める形：`#rgb`・`#rgba`・`#rrggbb`・`#rrggbbaa`・`rgb()`/`rgba()`・`hsl()`/`hsla()`（カンマ区切りと空白区切り）・色の名前（CSS の 148 色）。
 * 透明度は端末に無いので捨てる（`transparent` と `currentcolor` 等は読めない＝null）。**web（ブラウザの CSS）が落とす値は通さない**——
 * 端末版で入れた色がブラウザで読めないことが無いように（端末版で読めるのは CSS の色の一部。web では効いても端末版では既定の色のまま）。
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED =
  "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 " +
  "blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 " +
  "chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b " +
  "darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b " +
  "darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a " +
  "darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 " +
  "darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff " +
  "firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 " +
  "goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 " +
  "indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 " +
  "lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 " +
  "lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa " +
  "lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 " +
  "linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 " +
  "mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc " +
  "mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead " +
  "navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 " +
  "palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 " +
  "peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 " +
  "rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 " +
  "seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 " +
  "snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 " +
  "turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32";

const NAMED_COLORS: ReadonlyMap<string, string> = new Map(
  NAMED.split(" ").map((p) => p.split(":") as [string, string]),
);

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** `rgb()` の 1 成分（`0`〜`255` か `%`）。 */
function channel(s: string): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(%?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return clamp255(m[2] ? (n * 255) / 100 : n);
}

/** 透明度（`0`〜`1` か `%`）。読めるかだけを見る（値は捨てる）。 */
function alphaOk(s: string | undefined): boolean {
  return s === undefined || /^([+-]?(?:\d+\.?\d*|\.\d+))(%?)$/.test(s);
}

/**
 * 関数の引数（カンマ区切りか、空白区切り＋`/ 透明度`）。**CSS と同じく**、空白区切りで透明度を付けるなら `/` が要る（`rgb(1 2 3 4)` は読めない）。
 */
function args(body: string): string[] | null {
  const t = body.trim();
  if (t.includes(",")) {
    const parts = t.split(",").map((x) => x.trim());
    return parts.length === 3 || parts.length === 4 ? parts : null;
  }
  const [main, alpha, ...rest] = t.split("/");
  if (rest.length > 0 || main === undefined) return null;
  const parts = main.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  if (alpha !== undefined) {
    const a = alpha.trim();
    if (a === "" || /\s/.test(a)) return null;
    parts.push(a);
  }
  return parts;
}

function hsl(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  const f = (n: number): number => {
    const k = (n + hue * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: clamp255(f(0) * 255), g: clamp255(f(8) * 255), b: clamp255(f(4) * 255) };
}

/** 色の文字列 → RGB。読めなければ null。 */
export function parseCssColor(input: unknown): Rgb | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s === "") return null;
  const named = NAMED_COLORS.get(s);
  const hex = named ?? (s.startsWith("#") ? s.slice(1) : null);
  if (hex !== null) {
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b] = [...hex].map((c) => parseInt(c + c, 16));
      return { r: r!, g: g!, b: b! };
    }
    if (hex.length === 6 || hex.length === 8)
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    return null;
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const parts = args(fn[2]!);
  if (!parts || !alphaOk(parts[3])) return null;
  if (fn[1]!.startsWith("rgb")) {
    // 数と % を混ぜない（CSS の rgb() は 3 つとも数か、3 つとも %）。
    const pct = parts.slice(0, 3).map((p) => p.endsWith("%"));
    if (pct.some((x) => x !== pct[0])) return null;
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if (
      r === null ||
      g === null ||
      b === null ||
      r === undefined ||
      g === undefined ||
      b === undefined
    )
      return null;
    return { r, g, b };
  }
  const h = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg)?$/.exec(parts[0]!);
  const sat = /^(\d+\.?\d*|\.\d+)%$/.exec(parts[1]!);
  const lig = /^(\d+\.?\d*|\.\d+)%$/.exec(parts[2]!);
  if (!h || !sat || !lig) return null;
  return hsl(Number(h[1]), Math.min(1, Number(sat[1]) / 100), Math.min(1, Number(lig[1]) / 100));
}

/** 端末版で読める色か（色の上書きの入力の検査）。 */
export function isTuiColor(v: unknown): v is string {
  return parseCssColor(v) !== null;
}
