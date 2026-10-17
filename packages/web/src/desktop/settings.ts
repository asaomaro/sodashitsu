import { DesktopOptions } from "@sodashitsu/protocol";

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
  const { features, display, ...parsed } = DesktopOptions.parse(raw);
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
