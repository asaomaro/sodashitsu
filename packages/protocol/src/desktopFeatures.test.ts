import { expect, it } from "vitest";
import { desktopFeaturesProtocol, desktopFeaturesFromProtocols, DESKTOP_FEATURES_PREFIX } from "./desktopFeatures.js";
import { DesktopEndpointConnect } from "./desktopEndpoint.js";
it("round-trips known feature hints within the existing encrypted protocol format",()=>{
 const wire=desktopFeaturesProtocol(["sharedDeltas"]);expect(wire.length).toBeLessThanOrEqual(64);expect(wire).toMatch(/^soda-desktop-[a-z0-9-]{1,64}$/);expect(DesktopEndpointConnect.parse({type:"connect",protocols:[wire]}).protocols).toEqual([wire]);expect([...desktopFeaturesFromProtocols([wire])]).toEqual(["sharedDeltas"]);
});
it("ignores unknown reserved bits while reading known bits",()=>{
 const unknown=DESKTOP_FEATURES_PREFIX+"80000000000000000000000000000000",both=DESKTOP_FEATURES_PREFIX+"80000000000000000000000000000001";expect([...desktopFeaturesFromProtocols([unknown])]).toEqual([]);expect([...desktopFeaturesFromProtocols([both])]).toEqual(["sharedDeltas"]);
});
it.each(["","1","g".repeat(32),"0".repeat(33),"A".repeat(32)])("declines malformed feature hints without enabling anything: %s",value=>{expect([...desktopFeaturesFromProtocols([DESKTOP_FEATURES_PREFIX+value])]).toEqual([]);});
it("declines ambiguous hints and leaves legacy protocol parsing independent",()=>{
 const wire=desktopFeaturesProtocol(["sharedDeltas"]);expect([...desktopFeaturesFromProtocols([wire,wire])]).toEqual([]);expect([...desktopFeaturesFromProtocols(["soda-desktop-shared-deltas-v1"])]).toEqual([]);expect([...desktopFeaturesFromProtocols([desktopFeaturesProtocol([])])]).toEqual([]);
});
it("does not encode an unregistered feature through an inherited object property",()=>{expect(()=>desktopFeaturesProtocol(["toString" as any])).toThrow(TypeError);});
it("negotiates shared virtual separately from ordinary sharing hints",()=>{expect([...desktopFeaturesFromProtocols([desktopFeaturesProtocol(["sharedVirtual"])])]).toEqual(["sharedVirtual"]);expect([...desktopFeaturesFromProtocols([desktopFeaturesProtocol(["sharedMonitors"])])]).not.toContain("sharedVirtual");});
it("negotiates protected ordinary-user files as its own bounded feature hint",()=>{const wire=desktopFeaturesProtocol(["protectedFiles"]);expect(wire.length).toBeLessThanOrEqual(64);expect([...desktopFeaturesFromProtocols([wire])]).toEqual(["protectedFiles"]);});
it("negotiates protected video in its own bounded feature bit",()=>{
 const protocol=desktopFeaturesProtocol(["protectedVideo"]);expect(protocol).toBe(DESKTOP_FEATURES_PREFIX+"00000000000000000000000000000200");expect([...desktopFeaturesFromProtocols([protocol])]).toEqual(["protectedVideo"]);
});

it('keeps ordinary-user protected audio opt-in separate from protected video',()=>{const wire=desktopFeaturesProtocol(['protectedAudio']);expect(wire).toBe(DESKTOP_FEATURES_PREFIX+'00000000000000000000000000000400');expect([...desktopFeaturesFromProtocols([wire])]).toEqual(['protectedAudio']);expect([...desktopFeaturesFromProtocols([desktopFeaturesProtocol(['protectedVideo'])])]).not.toContain('protectedAudio');});
