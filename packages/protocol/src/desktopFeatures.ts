/** Client capability hints, never an authorization grant. Fixed 128-bit wire budget. */
export const DESKTOP_FEATURES_PREFIX = "soda-desktop-features-v2-";
const featureBits = { sharedDeltas: 0, folderCheckpoints: 1, sharedMonitors: 2, endpointClose: 3, endpointAgent: 4, signin: 5, independentMonitors: 6, sharedVirtual: 7, protectedFiles: 8, protectedVideo: 9, protectedAudio: 10 } as const;
export type DesktopFeature = keyof typeof featureBits;
export function desktopFeaturesProtocol(features: readonly DesktopFeature[]): string {
  let bits = 0n;
  for (const name of features) {
    if (!Object.hasOwn(featureBits, name)) throw new TypeError("Unknown desktop feature");
    const index = featureBits[name];
    bits |= 1n << BigInt(index);
  }
  return DESKTOP_FEATURES_PREFIX + bits.toString(16).padStart(32, "0");
}
export function desktopFeaturesFromProtocols(protocols: readonly string[]): ReadonlySet<DesktopFeature> {
  const hints = protocols.filter(value => value.startsWith(DESKTOP_FEATURES_PREFIX));
  const features = new Set<DesktopFeature>();
  if (hints.length !== 1) return features;
  const suffix = hints[0]!.slice(DESKTOP_FEATURES_PREFIX.length);
  if (!/^[0-9a-f]{32}$/.test(suffix)) return features;
  const bits = BigInt("0x" + suffix);
  for (const name of Object.keys(featureBits) as DesktopFeature[])
    if ((bits & (1n << BigInt(featureBits[name]))) !== 0n) features.add(name);
  return features;
}
