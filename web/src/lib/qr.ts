/**
 * A dependency-free QR encoder - byte mode, error-correction level M, versions 1 to 10.
 *
 * Why this exists: naming a recipient on stage by pasting a 42-character address is the slowest
 * beat in the demo (spec 02 Flow E, spec 08 beat 2:10). The recipient shows a QR of
 * `https://bank-rock.com/rock/<id>?give=<address>`; the giver points the phone's own camera at
 * it and the link opens the give sheet with the address already in it. That needs a QR
 * *generator*, not a scanner, so no camera library and no runtime dependency is involved.
 *
 * Scope is deliberately the smallest thing that does the job:
 *  - byte mode only (a URL is not alphanumeric-safe: it has lowercase letters and `?`),
 *  - level M (~15% recovery), the usual choice for a screen-to-screen scan,
 *  - versions 1-10, i.e. up to 213 payload bytes at level M. The URLs above are ~80.
 * Anything longer throws rather than silently truncating.
 *
 * Correctness is not taken on trust. `qr.test.ts` checks this module against fixtures produced
 * by an independent, widely used encoder (the `qrcode` npm package, run once offline - it is not
 * a dependency of this project), for every mask of a fixed input and for the auto-masked output
 * of the exact URL shapes the app builds.
 *
 * Structure follows ISO/IEC 18004: data codewords, Reed-Solomon blocks, interleave, function
 * patterns, zigzag placement, eight candidate masks scored by the standard penalty rules.
 */

/* -------------------------------------------------------------------------- */
/* GF(256)                                                                     */
/* -------------------------------------------------------------------------- */

/** Antilog and log tables for GF(256) with the QR primitive polynomial 0x11D. */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** The generator polynomial of degree `degree`, highest coefficient first. */
export function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The `ecLen` Reed-Solomon check codewords for one block of data codewords. */
export function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const buffer = new Uint8Array(data.length + ecLen);
  buffer.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buffer[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return buffer.slice(data.length);
}

/* -------------------------------------------------------------------------- */
/* Version tables (level M only)                                               */
/* -------------------------------------------------------------------------- */

export interface VersionSpec {
  version: number;
  /** Error-correction codewords per block. */
  ecPerBlock: number;
  /** Blocks in the first group, and how many data codewords each holds. */
  group1Blocks: number;
  group1Data: number;
  /** Blocks in the second group; those hold one more data codeword each. */
  group2Blocks: number;
  group2Data: number;
}

/**
 * ISO/IEC 18004 Table 9, level M rows, versions 1-10.
 *
 * The invariant `group1Blocks * (group1Data + ecPerBlock) + group2Blocks * (group2Data +
 * ecPerBlock) === totalCodewords(version)` is asserted in the tests, so a typo here cannot pass
 * silently.
 */
export const VERSIONS_M: readonly VersionSpec[] = [
  { version: 1, ecPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
  { version: 2, ecPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
  { version: 3, ecPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
  { version: 4, ecPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
  { version: 5, ecPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
  { version: 6, ecPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
  { version: 7, ecPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
  { version: 8, ecPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
  { version: 9, ecPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  { version: 10, ecPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 },
] as const;

/** Total codewords (data + error correction) for versions 1-10. ISO/IEC 18004 Table 1. */
export const TOTAL_CODEWORDS: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/** Alignment-pattern centre coordinates, versions 1-10. Version 1 has none. */
const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Bits left over after the interleaved codewords, per version. */
const REMAINDER_BITS: readonly number[] = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

export function dataCodewordCount(spec: VersionSpec): number {
  return spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data;
}

export function moduleCountForVersion(version: number): number {
  return version * 4 + 17;
}

/* -------------------------------------------------------------------------- */
/* Format and version information                                              */
/* -------------------------------------------------------------------------- */

/** Level M is `00` in the two format bits. */
const EC_LEVEL_M_BITS = 0b00;

const FORMAT_GENERATOR = 0b10100110111;
const FORMAT_MASK = 0b101010000010010;
const VERSION_GENERATOR = 0b1111100100101;

function bitLength(value: number): number {
  let length = 0;
  let rest = value;
  while (rest !== 0) {
    length += 1;
    rest >>>= 1;
  }
  return length;
}

/** The 15-bit format information word for level M and the given mask (BCH(15,5), then XOR). */
export function formatInfoBits(mask: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | mask;
  let value = data << 10;
  while (bitLength(value) - bitLength(FORMAT_GENERATOR) >= 0) {
    value ^= FORMAT_GENERATOR << (bitLength(value) - bitLength(FORMAT_GENERATOR));
  }
  return ((data << 10) | value) ^ FORMAT_MASK;
}

/** The 18-bit version information word, used from version 7 up. */
export function versionInfoBits(version: number): number {
  let value = version << 12;
  while (bitLength(value) - bitLength(VERSION_GENERATOR) >= 0) {
    value ^= VERSION_GENERATOR << (bitLength(value) - bitLength(VERSION_GENERATOR));
  }
  return (version << 12) | value;
}

/* -------------------------------------------------------------------------- */
/* Bit buffer and codeword assembly                                            */
/* -------------------------------------------------------------------------- */

class BitBuffer {
  private readonly bits: number[] = [];

  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  toCodewords(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i] === 1) out[i >> 3] |= 0x80 >> (i & 7);
    }
    return out;
  }
}

/** UTF-8 bytes, which is what every QR reader assumes for byte mode on a URL. */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The smallest level-M version in 1-10 that holds `byteLength` bytes in byte mode. */
export function chooseVersion(byteLength: number): VersionSpec {
  for (const spec of VERSIONS_M) {
    const countBits = spec.version < 10 ? 8 : 16;
    const needed = 4 + countBits + byteLength * 8;
    if (needed <= dataCodewordCount(spec) * 8) return spec;
  }
  throw new Error(
    `QR payload of ${byteLength} bytes exceeds version 10 at error level M (213 bytes). ` +
      "This encoder covers versions 1-10 only.",
  );
}

/** Mode indicator 0100, length, payload, terminator, byte padding, then the two pad codewords. */
export function buildDataCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const capacity = dataCodewordCount(spec);
  const countBits = spec.version < 10 ? 8 : 16;

  const buffer = new BitBuffer();
  buffer.put(0b0100, 4);
  buffer.put(bytes.length, countBits);
  for (const byte of bytes) buffer.put(byte, 8);

  const capacityBits = capacity * 8;
  const terminator = Math.min(4, capacityBits - buffer.length);
  if (terminator > 0) buffer.put(0, terminator);
  if (buffer.length % 8 !== 0) buffer.put(0, 8 - (buffer.length % 8));

  const codewords = buffer.toCodewords(capacity);
  let index = buffer.length / 8;
  let padWithEc = true;
  while (index < capacity) {
    codewords[index] = padWithEc ? 0xec : 0x11;
    padWithEc = !padWithEc;
    index += 1;
  }
  return codewords;
}

/** Splits into blocks, computes each block's ECC, then interleaves both, as the standard requires. */
export function interleaveCodewords(data: Uint8Array, spec: VersionSpec): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  const push = (count: number, size: number) => {
    for (let i = 0; i < count; i++) {
      const block = data.slice(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  };
  push(spec.group1Blocks, spec.group1Data);
  push(spec.group2Blocks, spec.group2Data);

  const total = dataBlocks.reduce((sum, b) => sum + b.length, 0) + ecBlocks.length * spec.ecPerBlock;
  const out = new Uint8Array(total);
  let cursor = 0;

  const longestData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longestData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) out[cursor++] = block[i];
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of ecBlocks) out[cursor++] = block[i];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Matrix                                                                      */
/* -------------------------------------------------------------------------- */

export interface QrMatrix {
  version: number;
  /** Modules per side, `version * 4 + 17`. */
  size: number;
  /** The mask pattern that was applied, 0-7. */
  mask: number;
  /** `modules[row][col]` - true is a dark module. */
  modules: boolean[][];
}

type MaskFn = (row: number, col: number) => boolean;

/** The eight mask conditions, ISO/IEC 18004 Table 10. A true value inverts the module. */
export const MASK_FUNCTIONS: readonly MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

interface Canvas {
  size: number;
  /** -1 unset, 0 light, 1 dark. */
  cells: Int8Array;
  /** True where a function pattern lives, so data placement skips it. */
  reserved: Uint8Array;
}

function createCanvas(size: number): Canvas {
  return { size, cells: new Int8Array(size * size).fill(-1), reserved: new Uint8Array(size * size) };
}

function setModule(canvas: Canvas, row: number, col: number, dark: boolean, reserve: boolean) {
  canvas.cells[row * canvas.size + col] = dark ? 1 : 0;
  if (reserve) canvas.reserved[row * canvas.size + col] = 1;
}

function isReserved(canvas: Canvas, row: number, col: number): boolean {
  return canvas.reserved[row * canvas.size + col] === 1;
}

function placeFinder(canvas: Canvas, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= canvas.size || cc < 0 || cc >= canvas.size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setModule(canvas, rr, cc, inRing || inCore, true);
    }
  }
}

function placeAlignment(canvas: Canvas, version: number) {
  const centres = ALIGNMENT_CENTRES[version - 1];
  for (const row of centres) {
    for (const col of centres) {
      // The three finder corners have no alignment pattern.
      const nearFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === canvas.size - 7) ||
        (row === canvas.size - 7 && col === 6);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setModule(canvas, row + r, col + c, dark, true);
        }
      }
    }
  }
}

function placeTiming(canvas: Canvas) {
  for (let i = 8; i < canvas.size - 8; i++) {
    if (!isReserved(canvas, 6, i)) setModule(canvas, 6, i, i % 2 === 0, true);
    if (!isReserved(canvas, i, 6)) setModule(canvas, i, 6, i % 2 === 0, true);
  }
}

/** Format areas are reserved before data placement and written afterwards. */
function reserveFormatAreas(canvas: Canvas, version: number) {
  const size = canvas.size;
  for (let i = 0; i < 9; i++) {
    if (!isReserved(canvas, 8, i)) setModule(canvas, 8, i, false, true);
    if (!isReserved(canvas, i, 8)) setModule(canvas, i, 8, false, true);
  }
  for (let i = 0; i < 8; i++) {
    setModule(canvas, 8, size - 1 - i, false, true);
    setModule(canvas, size - 1 - i, 8, false, true);
  }
  // The always-dark module below the bottom-left finder.
  setModule(canvas, size - 8, 8, true, true);

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      setModule(canvas, Math.floor(i / 3), (i % 3) + size - 11, false, true);
      setModule(canvas, (i % 3) + size - 11, Math.floor(i / 3), false, true);
    }
  }
}

function writeFormatInfo(canvas: Canvas, mask: number) {
  const size = canvas.size;
  const bits = formatInfoBits(mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 6) setModule(canvas, i, 8, dark, true);
    else if (i < 8) setModule(canvas, i + 1, 8, dark, true);
    else setModule(canvas, size - 15 + i, 8, dark, true);
  }
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 8) setModule(canvas, 8, size - i - 1, dark, true);
    else if (i < 9) setModule(canvas, 8, 15 - i, dark, true);
    else setModule(canvas, 8, 15 - i - 1, dark, true);
  }
  setModule(canvas, size - 8, 8, true, true);
}

function writeVersionInfo(canvas: Canvas, version: number) {
  if (version < 7) return;
  const size = canvas.size;
  const bits = versionInfoBits(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >> i) & 1) === 1;
    setModule(canvas, Math.floor(i / 3), (i % 3) + size - 11, dark, true);
    setModule(canvas, (i % 3) + size - 11, Math.floor(i / 3), dark, true);
  }
}

/** Two-module-wide columns, right to left, alternating up and down, skipping column 6. */
function placeData(canvas: Canvas, codewords: Uint8Array, remainderBits: number) {
  const size = canvas.size;
  const totalBits = codewords.length * 8 + remainderBits;
  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        const column = col - c;
        if (isReserved(canvas, row, column)) continue;
        let dark = false;
        if (bitIndex < totalBits && bitIndex < codewords.length * 8) {
          dark = ((codewords[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
        }
        bitIndex += 1;
        setModule(canvas, row, column, dark, false);
      }
    }
    upward = !upward;
  }
}

function applyMask(canvas: Canvas, mask: number): boolean[][] {
  const fn = MASK_FUNCTIONS[mask];
  const modules: boolean[][] = [];
  for (let row = 0; row < canvas.size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < canvas.size; col++) {
      const value = canvas.cells[row * canvas.size + col] === 1;
      const masked = isReserved(canvas, row, col) ? value : value !== fn(row, col);
      line.push(masked);
    }
    modules.push(line);
  }
  return modules;
}

/* -------------------------------------------------------------------------- */
/* Mask selection                                                              */
/* -------------------------------------------------------------------------- */

const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

/** ISO/IEC 18004 §8.8.2 penalty score. The lowest-scoring mask is the one that ships. */
export function maskPenalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1 - runs of five or more identical modules in a row or column.
  for (let i = 0; i < size; i++) {
    for (const read of [
      (j: number) => modules[i][j],
      (j: number) => modules[j][i],
    ]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (read(j) === read(j - 1)) {
          run += 1;
        } else {
          if (run >= 5) score += N1 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += N1 + (run - 5);
    }
  }

  // Rule 2 - every 2x2 block of one colour.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const value = modules[row][col];
      if (
        modules[row][col + 1] === value &&
        modules[row + 1][col] === value &&
        modules[row + 1][col + 1] === value
      ) {
        score += N2;
      }
    }
  }

  // Rule 3 - the finder-like 1:1:3:1:1 pattern with four light modules on one side.
  const pattern = [true, false, true, true, true, false, true];
  const light4 = [false, false, false, false];
  const forward = [...pattern, ...light4];
  const backward = [...light4, ...pattern];
  const matches = (read: (i: number) => boolean, start: number, want: boolean[]) => {
    for (let i = 0; i < want.length; i++) {
      if (read(start + i) !== want[i]) return false;
    }
    return true;
  };
  for (let i = 0; i < size; i++) {
    for (const read of [
      (j: number) => modules[i][j],
      (j: number) => modules[j][i],
    ]) {
      for (let j = 0; j + 11 <= size; j++) {
        if (matches(read, j, forward)) score += N3;
        if (matches(read, j, backward)) score += N3;
      }
    }
  }

  // Rule 4 - deviation of the dark-module share from 50%.
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (modules[row][col]) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * N4;

  return score;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export interface EncodeQrOptions {
  /** Force a mask pattern (0-7) instead of scoring all eight. Used by the tests. */
  mask?: number;
}

/**
 * Encodes `text` as a level-M byte-mode QR symbol.
 *
 * @throws if the payload does not fit in version 10 at level M, or the forced mask is invalid.
 */
export function encodeQr(text: string, options: EncodeQrOptions = {}): QrMatrix {
  if (text.length === 0) throw new Error("QR payload is empty");
  const bytes = utf8Bytes(text);
  const spec = chooseVersion(bytes.length);
  const codewords = interleaveCodewords(buildDataCodewords(bytes, spec), spec);

  const size = moduleCountForVersion(spec.version);
  const canvas = createCanvas(size);
  placeFinder(canvas, 0, 0);
  placeFinder(canvas, 0, size - 7);
  placeFinder(canvas, size - 7, 0);
  placeAlignment(canvas, spec.version);
  placeTiming(canvas);
  reserveFormatAreas(canvas, spec.version);
  placeData(canvas, codewords, REMAINDER_BITS[spec.version - 1]);

  let chosen = options.mask;
  if (chosen !== undefined) {
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > 7) {
      throw new Error(`mask must be an integer 0-7; got ${String(options.mask)}`);
    }
  } else {
    let best = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 8; mask++) {
      writeFormatInfo(canvas, mask);
      const penalty = maskPenalty(applyMask(canvas, mask));
      if (penalty < best) {
        best = penalty;
        chosen = mask;
      }
    }
  }

  const mask = chosen ?? 0;
  writeFormatInfo(canvas, mask);
  writeVersionInfo(canvas, spec.version);

  return { version: spec.version, size, mask, modules: applyMask(canvas, mask) };
}

/**
 * The dark modules as one SVG path, in module units, so the caller sets the size with a
 * `viewBox` and never a pixel literal. `quietZone` is the mandatory light border (4 modules by
 * the standard) and is included in the coordinate space.
 */
export function qrPathData(matrix: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.modules[row][col]) continue;
      parts.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** The side of the coordinate space `qrPathData` draws into, in module units. */
export function qrViewBoxSize(matrix: QrMatrix, quietZone = 4): number {
  return matrix.size + quietZone * 2;
}
