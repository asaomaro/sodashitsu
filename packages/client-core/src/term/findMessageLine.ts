/** Locate one retained occurrence, avoiding guesses for repeated prompts. */
export function findMessageLine(
  buffer: {
    length: number;
    getLine: (index: number) => { translateToString: (trimRight?: boolean) => string } | undefined;
  },
  message: string,
): number | null {
  const needle = message.replace(/\s+/g, "").slice(0, 70);
  if (needle.length < 8) return null;
  const first = Math.max(0, buffer.length - 100000),
    starts: number[] = [],
    parts: string[] = [];
  let total = 0;
  for (let row = first; row < buffer.length; row++) {
    const text = (buffer.getLine(row)?.translateToString(true) ?? "").replace(/\s+/g, "");
    if (total + text.length > 4 * 1024 * 1024) return null;
    starts.push(total);
    parts.push(text);
    total += text.length;
  }
  const text = parts.join(""),
    index = text.indexOf(needle);
  if (index < 0 || text.indexOf(needle, index + 1) >= 0) return null;
  let low = 0,
    high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]! <= index) low = mid;
    else high = mid - 1;
  }
  return first + low;
}
