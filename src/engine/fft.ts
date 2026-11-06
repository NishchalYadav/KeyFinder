/**
 * Minimal in-place radix-2 complex FFT. Twiddles and the bit-reversal table are
 * precomputed once per size, so repeated calls (one per audio frame) are cheap.
 * 8192 points takes a few ms on a mid-range phone in Hermes.
 */
export class FFT {
  readonly size: number;
  private readonly cosT: Float64Array;
  private readonly sinT: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two');
    }
    this.size = size;
    this.cosT = new Float64Array(size / 2);
    this.sinT = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosT[i] = Math.cos((2 * Math.PI * i) / size);
      this.sinT[i] = Math.sin((2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** Forward transform, in place. `re`/`im` must both have length `size`. */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0, tw = 0; k < half; k++, tw += step) {
          const wr = this.cosT[tw];
          const wi = -this.sinT[tw];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }
}
