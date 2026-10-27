// Fixed-size mono PCM frames. The local graph outputs silence, never sidetone.
class SodaMicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Int16Array(960); this.offset = 0; this.stopped = false; this.credit = true;
    this.port.onmessage = e => { if (e.data === 'ready') this.credit = true; if (e.data === 'stop') { this.stopped = true; this.samples.fill(0); this.offset = 0; } };
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (this.stopped) return false;
    const source = inputs[0]?.[0]; if (!source) return true;
    for (const value of source) {
      const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      this.samples[this.offset++] = Math.round(sample < 0 ? sample * 32768 : sample * 32767);
      if (this.offset === 960) {
        if (this.credit) {
        const bytes = new Uint8Array(1920), view = new DataView(bytes.buffer);
        for (let i = 0; i < 960; i++) view.setInt16(i * 2, this.samples[i], true);
        this.credit = false; this.port.postMessage({pcm:bytes.buffer, at:currentTime}, [bytes.buffer]); }
        this.samples.fill(0); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('soda-microphone', SodaMicrophoneProcessor);
