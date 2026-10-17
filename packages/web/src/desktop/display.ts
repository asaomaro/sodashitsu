export type DisplaySize = { width: number; height: number };
/** Prefer the largest supported mode that fits. If none fits, preserve 1:1 with scrolling. */
export function chooseDisplayMode(
  modes: readonly DisplaySize[],
  viewport: DisplaySize,
): DisplaySize | undefined {
  const valid = modes.filter(
    (m) =>
      m.width >= 320 &&
      m.height >= 200 &&
      m.width <= 4096 &&
      m.height <= 2400 &&
      m.width * m.height <= 8_000_000,
  );
  const fits = valid.filter(
    (m) => m.width <= Math.floor(viewport.width) && m.height <= Math.floor(viewport.height),
  );
  return [...(fits.length ? fits : valid)].sort(
    (a, b) =>
      (fits.length ? -1 : 1) * (a.width * a.height - b.width * b.height) || a.width - b.width,
  )[0];
}
export function sameDisplay(a: DisplaySize | undefined, b: DisplaySize | undefined) {
  return !!a && !!b && a.width === b.width && a.height === b.height;
}
