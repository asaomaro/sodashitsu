import { z } from "zod";
export const DESKTOP_MONITORS_PROTOCOL = "soda-desktop-monitors-v1";
export const DesktopMonitorRect = z
  .object({
    x: z.number().int().min(-65536).max(65536),
    y: z.number().int().min(-65536).max(65536),
    width: z.number().int().min(1).max(32768),
    height: z.number().int().min(1).max(32768),
  })
  .strict();
export const DesktopMonitor = DesktopMonitorRect.extend({
  id: z
    .string()
    .min(1)
    .max(128)
    .refine((v) => v !== "all" && !v.includes("\0")),
  primary: z.boolean(),
  scalePercent: z.number().int().min(50).max(1000).optional(),
}).strict();
const pixelRound = (value: number) => {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
};
const same = (a: z.infer<typeof DesktopMonitorRect>, b: z.infer<typeof DesktopMonitorRect>) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
export const DesktopMonitorLayout = z
  .object({
    selected: z.string().min(1).max(128),
    bounds: DesktopMonitorRect,
    allSupported: z.boolean(),
    monitors: z.array(DesktopMonitor).min(1).max(16),
  })
  .strict()
  .refine((v) => {
    if (
      new Set(v.monitors.map((m) => m.id)).size !== v.monitors.length ||
      v.bounds.width * v.bounds.height > 40000000
    )
      return false;
    if (v.selected !== "all") {
      const item = v.monitors.find((m) => m.id === v.selected);
      return !!item && same(item, v.bounds);
    }
    const x = Math.min(...v.monitors.map((m) => m.x)),
      y = Math.min(...v.monitors.map((m) => m.y)),
      right = Math.max(...v.monitors.map((m) => m.x + m.width)),
      bottom = Math.max(...v.monitors.map((m) => m.y + m.height));
    return v.allSupported && same(v.bounds, { x, y, width: right - x, height: bottom - y });
  });
export type DesktopMonitorLayout = z.infer<typeof DesktopMonitorLayout>;
/** Physical-pixel mapping, including monitors left/above primary and gaps. */
export function desktopMonitorAt(layout: DesktopMonitorLayout, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
    return undefined;
  const px = layout.bounds.x + pixelRound(x * (layout.bounds.width - 1)),
    py = layout.bounds.y + pixelRound(y * (layout.bounds.height - 1));
  return layout.monitors.find(
    (m) => px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height,
  );
}
