/** Fixed child marker is emitted only after the Windows player has loaded the audio. */
export function watchSpeechReady(child: { stdout?: NodeJS.ReadableStream | null }, signal: AbortSignal, started?: () => void): void {
  let buffer = "", ready = false;
  child.stdout?.on("data", (chunk: Buffer | string) => {
    if (ready || signal.aborted) return;
    buffer = (buffer + chunk.toString()).slice(-128);
    if (buffer.includes("SODA_VOICE_READY\n") || buffer.includes("SODA_VOICE_READY\r\n")) {
      ready = true;
      started?.();
    }
  });
}
