import { expect, it } from "vitest";
import { localSettingsRequest } from "./WsServerWs.js";
it("requires a direct local connection and loopback Host/Origin", () => {
  expect(
    localSettingsRequest(
      { headers: { host: "localhost:7780", origin: "http://localhost:7780" } },
      true,
    ),
  ).toBe(true);
  expect(localSettingsRequest({ headers: { host: "127.0.0.1:7780" } }, true)).toBe(true);
  for (const headers of [
    { host: "localhost:7780", origin: "https://public.example" },
    { host: "public.example" },
    { host: "localhost:7780", "x-forwarded-for": "192.168.1.2" },
    { host: "localhost:7780", forwarded: "for=192.168.1.2" },
    {},
  ])
    expect(localSettingsRequest({ headers }, true)).toBe(false);
  expect(localSettingsRequest({ headers: { host: "localhost:7780" } }, false)).toBe(false);
});
