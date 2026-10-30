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

it("keeps OCR disabled and accepts only bounded local paths and language lists", () => {
  expect(DesktopAssistantPreferences.parse({})).toMatchObject({
    ocrEnabled: false,
    ocrExecutable: "",
    ocrLanguage: "jpn+eng",
  });
  for (const ocrExecutable of [
    "/usr/bin/tesseract",
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
  ])
    expect(DesktopAssistantPreferences.parse({ ocrExecutable })).toMatchObject({ ocrExecutable });
  for (const ocrExecutable of [
    "tesseract",
    "https://example.com/tesseract",
    "/bin/tesseract\n--help",
    "/bin/tes\u0000seract",
  ])
    expect(() => DesktopAssistantPreferences.parse({ ocrExecutable })).toThrow();
  for (const ocrLanguage of ["jpn --psm 1", "eng/../../tmp", "a".repeat(68)])
    expect(() => DesktopAssistantPreferences.parse({ ocrLanguage })).toThrow();
});
