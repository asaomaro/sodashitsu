import { DesktopOptions, DesktopNativeCodec, DesktopMediaSettings } from "@sodashitsu/protocol";

const RenderingSettings = DesktopOptions.pick({
  width: true, fps: true, quality: true, deltas: true, adaptive: true, image: true,
  features: true, display: true,
}).strict();

export type ConnectionSettings = DesktopOptions & {
  deltas: boolean;
  adaptive: boolean;
  image: { colorMode: "full" | "rgb565" | "rgb332" | "gray16"; showCursor: boolean };
};
export const presets: Record<"low" | "balanced" | "quality", ConnectionSettings> = {
  low: {
    width: 960,
    fps: 5,
    quality: 40,
    deltas: true,
    adaptive: false,
    image: { colorMode: "rgb332", showCursor: true },
  },
  balanced: {
    width: 1280,
    fps: 10,
    quality: 65,
    deltas: true,
    adaptive: false,
    image: { colorMode: "full", showCursor: true },
  },
  quality: {
    width: 1920,
    fps: 15,
    quality: 85,
    deltas: true,
    adaptive: false,
    image: { colorMode: "full", showCursor: true },
  },
};
export function normalizeSettings(raw: unknown): ConnectionSettings {
  const { features, display, ...parsed } = RenderingSettings.parse(raw);
  return {
    ...parsed,
    deltas: parsed.deltas ?? true,
    adaptive: parsed.adaptive ?? false,
    image: parsed.image ?? { colorMode: "full", showCursor: true },
  };
}
const key = (machineId: string) => `soda:desktop:connection:v1:${machineId}`;
export function loadSettings(machineId: string): ConnectionSettings {
  try {
    const value = localStorage.getItem(key(machineId));
    return normalizeSettings(value ? JSON.parse(value) : {});
  } catch {
    return normalizeSettings({});
  }
}
/** Only rendering preferences, never a grant, ticket, input permission or image. */
export function saveSettings(machineId: string, settings: ConnectionSettings): boolean {
  try {
    localStorage.setItem(key(machineId), JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

const ViewerPreferences = DesktopOptions.pick({}).extend({
  transport: DesktopMediaSettings.shape.transport.default("auto"),
  bitrate: DesktopMediaSettings.shape.maxBitrateKbps,
  codec: DesktopNativeCodec.default("h264"),
  fps: DesktopMediaSettings.shape.fps.default(60).refine(value=>value===30||value===60),
  udp: DesktopOptions.shape.adaptive.default(true),
  fit: DesktopOptions.shape.adaptive.default(true),
}).strict();
export function normalizeViewerPreferences(raw: unknown) { return ViewerPreferences.parse(raw); }
export type ViewerPreferences = ReturnType<typeof normalizeViewerPreferences>;
const viewerKey = (machineId: string) => `soda:desktop:viewer:v1:${machineId}`;
export function loadViewerPreferences(machineId: string): ViewerPreferences {
  try {
    const value = localStorage.getItem(viewerKey(machineId));
    return normalizeViewerPreferences(value ? JSON.parse(value) : {});
  } catch { return normalizeViewerPreferences({}); }
}
/** Quality/scale preferences only. Starting capture or granting access stays explicit. */
export function saveViewerPreferences(machineId: string, preferences: ViewerPreferences): boolean {
  try { localStorage.setItem(viewerKey(machineId), JSON.stringify(normalizeViewerPreferences(preferences))); return true; }
  catch { return false; }
}
