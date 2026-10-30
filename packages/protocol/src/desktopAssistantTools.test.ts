import { expect, it } from "vitest";
import { DesktopAssistantPreferences } from "./desktopAssistant.js";

it("keeps audio processing disabled until explicitly configured on a loopback endpoint", () => {
  expect(DesktopAssistantPreferences.parse({})).toMatchObject({
    transcriptionEnabled: false,
    transcriptionOrigin: "http://127.0.0.1:8080",
  });
  expect(
    DesktopAssistantPreferences.parse({
      transcriptionEnabled: true,
      transcriptionOrigin: "http://localhost:8081/",
    }),
  ).toMatchObject({ transcriptionEnabled: true, transcriptionOrigin: "http://localhost:8081" });
  for (const transcriptionOrigin of [
    "https://example.test",
    "http://192.168.1.1:8080",
    "http://localhost/inference",
    "http://user:secret@localhost",
    "http://localhost?token=private",
  ])
    expect(() =>
      DesktopAssistantPreferences.parse({ transcriptionEnabled: true, transcriptionOrigin }),
    ).toThrow();
});
