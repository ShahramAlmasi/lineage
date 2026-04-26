/**
 * Seeded Mersenne Twister PRNG that matches Python's random.Random exactly.
 *
 * Implements MT19937 with the same tempering, seeding, and output mapping
 * as CPython's Modules/_randommodule.c. Every public method consumes the
 * same underlying genrand_uint32() calls as Python for identical sequences.
 */

// ── MT19937 constants ──────────────────────────────────────────────────
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df; // a.k.a. 2567483615
const UPPER_MASK = 0x80000000; // 2147483648
const LOWER_MASK = 0x7fffffff; // 2147483647

// ── Type alias ─────────────────────────────────────────────────────────
type U32 = number; // always in [0, 2^32 - 1], stored as a JS number

export class PRNG {
  private mt: U32[];
  private mti: number;

  // gauss() caching (Box-Muller, identical to CPython)
  private _gaussNext: number | null = null;

  constructor(seed?: number | null) {
    this.mt = new Array(N);
    this.mti = N + 1; // not yet initialised

    if (seed === undefined || seed === null) {
      throw new Error("PRNG requires an explicit seed for deterministic behavior");
    }

    this.initSeed(seed);
  }

  // ── Core MT19937 ─────────────────────────────────────────────────────

  /** CPython init_by_array(key=[seed]) — not the original init_genrand. */
  private initSeed(seed: number): void {
    // Step 1: init_genrand(19650218)
    this.mt[0] = 19650218;
    for (let i = 1; i < N; i++) {
      this.mt[i] = this.imul32(1812433253, this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30));
      this.mt[i] = (this.mt[i]! + i) >>> 0;
    }

    // Step 2: mix in key=[seed]
    let i = 1;
    let j = 0;
    const keyLen = 1;
    for (let k = 0; k < Math.max(N, keyLen); k++) {
      this.mt[i] = (this.mt[i]! ^ this.imul32(this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30), 1664525)) + seed + j;
      this.mt[i] = this.mt[i]! >>> 0;
      i++;
      j++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
      if (j >= keyLen) j = 0;
    }

    // Step 3: final wash
    for (let k = 0; k < N - 1; k++) {
      this.mt[i] = (this.mt[i]! ^ this.imul32(this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30), 1566083941)) - i;
      this.mt[i] = this.mt[i]! >>> 0;
      i++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
    }

    this.mt[0] = 0x80000000;
    this.mti = N;
  }

  /** Generate the next 32-bit unsigned integer. Matches genrand_uint32. */
  private genrandUint32(): U32 {
    if (this.mti >= N) {
      // Generate N new values
      for (let kk = 0; kk < N - M; kk++) {
        const y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + M]! ^ (y >>> 1) ^ (((y & 1) === 0) ? 0 : MATRIX_A);
      }
      for (let kk = N - M; kk < N - 1; kk++) {
        const y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + (M - N)]! ^ (y >>> 1) ^ (((y & 1) === 0) ? 0 : MATRIX_A);
      }
      const y = (this.mt[N - 1]! & UPPER_MASK) | (this.mt[0]! & LOWER_MASK);
      this.mt[N - 1] = this.mt[M - 1]! ^ (y >>> 1) ^ (((y & 1) === 0) ? 0 : MATRIX_A);
      this.mti = 0;
    }

    let y = this.mt[this.mti++]!;

    // Tempering (identical to CPython / MT reference)
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680; // TEMPERING_B
    y ^= (y << 15) & 0xefc60000; // TEMPERING_C
    y ^= y >>> 18;

    return y >>> 0;
  }

  /** Unsigned 32-bit multiply – avoids float53 precision issues. */
  private imul32(a: number, b: number): U32 {
    // Use Math.imul for correct 32-bit multiplication
    return Math.imul(a, b) >>> 0;
  }

  // ── Public API (matches Python random.Random) ─────────────────────────

  /**
   * random() — return float in [0.0, 1.0).
   * Consumes TWO genrand_uint32 calls to produce 53 bits of precision,
   * matching CPython: (x >> 5) * 67108864.0 + (y >> 6), then / 2^53.
   */
  random(): number {
    const x = this.genrandUint32();
    const y = this.genrandUint32();
    // CPython: (x >> 5) * 67108864.0 + (y >> 6)
    // Then multiply by (1.0 / 9007199254740992.0)
    // 67108864 = 2^26, 9007199254740992 = 2^53
    return ((x >>> 5) * 67108864.0 + (y >>> 6)) / 9007199254740992.0;
  }

  /**
   * uniform(a, b) — return float in [a, b).
   * a + (b - a) * random(), consuming one random() call.
   */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  /**
   * gauss(mu, sigma) — Gaussian using Box-Muller with caching.
   * Matches CPython exactly: caches the second value from each pair.
   */
  private static readonly TWO_PI = 2.0 * Math.PI;

  gauss(mu: number, sigma: number): number {
    if (this._gaussNext !== null) {
      const z = this._gaussNext;
      this._gaussNext = null;
      return mu + z * sigma;
    }

    const x2pi = this.random() * PRNG.TWO_PI;
    const g2rad = Math.sqrt(-2.0 * Math.log(1.0 - this.random()));
    this._gaussNext = Math.sin(x2pi) * g2rad;
    return mu + Math.cos(x2pi) * g2rad * sigma;
  }

  /**
   * choice(seq) — random element from array.
   * Uses _randbelow(len), matching Python's rejection-sampling approach.
   */
  choice<T>(seq: readonly T[]): T {
    if (seq.length === 0) throw new Error("cannot choose from empty sequence");
    return seq[this._randbelow(seq.length)]!;
  }

  /**
   * randint(a, b) — random integer N with a <= N <= b.
   * Equivalent to _randbelow(b - a + 1) + a.
   */
  randint(a: number, b: number): number {
    return this._randbelow(b - a + 1) + a;
  }

  /**
   * shuffle(seq) — Fisher-Yates shuffle in-place (matches CPython).
   * Iterates i from len-1 down to 1, swapping with _randbelow(i+1).
   */
  shuffle<T>(seq: T[]): void {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = this._randbelow(i + 1);
      const tmp = seq[i];
      seq[i] = seq[j];
      seq[j] = tmp;
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  /**
   * _randbelow(n) — random integer in [0, n).
   * Matches CPython's _randbelow_with_getrandbits:
   *   k = ceil(log2(n))  (i.e., n.bit_length())
   *   loop: r = getrandbits(k), accept if r < n
   */
  private _randbelow(n: number): number {
    const k = this._bitLength(n);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = this._getrandbits(k);
      if (r < n) return r;
    }
  }

  /** Bit length of a positive integer (matches Python's int.bit_length()). */
  private _bitLength(n: number): number {
    if (n <= 0) return 0;
    // 32 - leading zeros
    // But n is small (array lengths), so simple loop is fine
    let bits = 0;
    let v = n;
    while (v > 0) {
      bits++;
      v >>= 1;
    }
    return bits;
  }

  /**
   * getrandbits(k) — return integer with k random bits.
   * For k <= 32: take lowest k bits from one genrand_uint32.
   * For k > 32: concatenate multiple genrand_uint32 results.
   * Matches CPython's implementation.
   */
  private _getrandbits(k: number): number {
    if (k <= 0) return 0;
    if (k <= 32) {
      return this.genrandUint32() >>> (32 - k);
    }
    // For larger k (unlikely in our use case, but included for correctness)
    let result = 0;
    let remaining = k;
    while (remaining > 0) {
      const take = Math.min(remaining, 32);
      result = (result << take) | (this.genrandUint32() & ((1 << take) - 1));
      remaining -= take;
    }
    return result;
  }
}
