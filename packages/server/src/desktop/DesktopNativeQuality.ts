/** Local monotonic durations only. A slow WAN constrains the credit window,
 * but is not itself evidence that lowering bitrate will improve the link. */
export class DesktopNativeQuality {
  private samples: {ack: number; cost: number; decode: number; lost: boolean; buffered: number}[] = [];
  private since: number;
  private recoverAt: number;
  private warmup = 3;
  private current: {fps: number; kbps: number};
  constructor(private readonly maximum: {fps: number; kbps: number; window: number}, now: number) {
    this.current = {fps: maximum.fps, kbps: maximum.kbps};
    this.since = this.recoverAt = now;
  }
  sample(value: {ack: number; cost: number; decode: number; lost: boolean; buffered: number}, now: number) {
    if (this.warmup-- > 0) return;
    this.samples.push(value);
    if (this.samples.length > 24) this.samples.shift();
    if (this.samples.length < 8 || now - this.since < 1500) return;
    const samples = this.samples.splice(0);
    this.since = now;
    const p90 = (key: 'ack' | 'cost' | 'decode') => samples.map(v => v[key]).sort((a,b) => a-b)[Math.ceil(samples.length*.9)-1]!;
    const lost = samples.some(v => v.lost), queued = samples.some(v => v.buffered > 65536);
    const capacity = Math.min(this.maximum.fps, 850*this.maximum.window/Math.max(1,p90('ack')), 850/Math.max(1,p90('cost'),p90('decode')));
    let {fps,kbps} = this.current;
    const floor = Math.min(5,this.maximum.fps);
    if (lost || queued || capacity < fps*.85) {
      fps = Math.max(floor, Math.min(fps, Math.floor(capacity), lost || queued ? Math.floor(fps*.8) : fps));
      if (lost || queued) kbps = Math.max(128,Math.floor(kbps*.8));
      this.recoverAt = now;
    } else if (now-this.recoverAt >= 10000 && capacity >= fps*.95) {
      fps = Math.max(fps,Math.min(this.maximum.fps,Math.floor(capacity),fps+Math.max(1,Math.ceil(this.maximum.fps*.1))));
      kbps = Math.min(this.maximum.kbps,Math.ceil(kbps*1.1));
      this.recoverAt = now;
    }
    if (fps === this.current.fps && kbps === this.current.kbps) return;
    return this.current = {fps,kbps};
  }
}
