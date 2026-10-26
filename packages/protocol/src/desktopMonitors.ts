import { z } from "zod";
export const DESKTOP_VIRTUAL_DISPLAY_PROTOCOL = "soda-desktop-virtual-display-v1";
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

export const DesktopVirtualFailure=z.object({type:z.literal('virtual_display_failure'),code:z.enum(['driver_missing','driver_unavailable','broker_missing','broker_unavailable','permission_denied','unsupported','timeout','target_changed','lease_lost','helper_incompatible','failed'])}).strict();
export function desktopVirtualFailureMessage(code: z.infer<typeof DesktopVirtualFailure>['code']):string {
 const messages={driver_missing:'仮想画面ドライバーが未導入です。署名済みパッケージを接続先へ登録してください。',driver_unavailable:'仮想画面ドライバーを起動できません。接続先でドライバーの状態を確認してください。',broker_missing:'仮想画面用の保護サービスが未導入です。',broker_unavailable:'仮想画面用の保護サービスに接続できません。サービスの導入・更新を確認してください。',permission_denied:'仮想画面の作成に必要な権限がありません。',unsupported:'仮想画面はWindows 11 x64の対応ドライバーを必要とします。',timeout:'仮想画面の起動が制限時間を超えました。',target_changed:'共有対象の仮想画面が消失または変更されました。',lease_lost:'仮想画面の所有者または接続が失効しました。',helper_incompatible:'接続先の補助プログラムが仮想画面に対応していません。更新してください。',failed:'仮想画面を開始できません。接続先の設定とドライバーを確認してください。'};
 return messages[code];
}
