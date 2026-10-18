export type DisplaySize = { width: number; height: number };
/** Largest supported mode within the image transport limits, independent of viewer size. */
export function chooseMaximumDisplayMode(
  modes: readonly DisplaySize[],
): DisplaySize | undefined {
  const valid = modes.filter(
    (m) =>
      m.width >= 320 &&
      m.height >= 200 &&
      m.width <= 4096 &&
      m.height <= 2400 &&
      m.width * m.height <= 8_000_000,
  );
  return [...valid].sort(
    (a, b) => b.width * b.height - a.width * a.height || b.width - a.width,
  )[0];
}
export function sameDisplay(a: DisplaySize | undefined, b: DisplaySize | undefined) {
  return !!a && !!b && a.width === b.width && a.height === b.height;
}
