const VERSION = 5;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 108;
const EC_CODEWORDS = 26;

function gfMul(a: number, b: number) {
  let result = 0;
  for (let i = 0; i < 8; i += 1) {
    if ((b & 1) !== 0) {
      result ^= a;
    }
    const highBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (highBit) {
      a ^= 0x1d;
    }
    b >>= 1;
  }
  return result;
}

function gfPow(power: number) {
  let result = 1;
  for (let i = 0; i < power; i += 1) {
    result = gfMul(result, 2);
  }
  return result;
}

function rsGenerator(degree: number) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0) as number[];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], gfPow(i));
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[]) {
  const generator = rsGenerator(EC_CODEWORDS);
  const result = new Array(EC_CODEWORDS).fill(0) as number[];

  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[EC_CODEWORDS - 1] = 0;

    for (let i = 0; i < EC_CODEWORDS; i += 1) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  }

  return result;
}

function pushBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function encodeBytes(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));

  if (bytes.length > 106) {
    throw new Error("QR payload is too long for the local encoder.");
  }

  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 8);
  bytes.forEach((byte) => pushBits(bits, byte, 8));
  pushBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }

  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
  }

  return data;
}

function makeMatrix() {
  return {
    modules: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false) as boolean[]),
    reserved: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false) as boolean[])
  };
}

function setModule(
  matrix: ReturnType<typeof makeMatrix>,
  row: number,
  col: number,
  value: boolean,
  reserve = true
) {
  if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) {
    return;
  }

  matrix.modules[row][col] = value;
  if (reserve) {
    matrix.reserved[row][col] = true;
  }
}

function addFinder(matrix: ReturnType<typeof makeMatrix>, row: number, col: number) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      const dark =
        r >= 0 &&
        r <= 6 &&
        c >= 0 &&
        c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      setModule(matrix, rr, cc, dark);
    }
  }
}

function addAlignment(matrix: ReturnType<typeof makeMatrix>, row: number, col: number) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      setModule(matrix, row + r, col + c, dark);
    }
  }
}

function addFunctionPatterns(matrix: ReturnType<typeof makeMatrix>) {
  addFinder(matrix, 0, 0);
  addFinder(matrix, 0, SIZE - 7);
  addFinder(matrix, SIZE - 7, 0);
  addAlignment(matrix, 30, 30);

  for (let i = 8; i < SIZE - 8; i += 1) {
    setModule(matrix, 6, i, i % 2 === 0);
    setModule(matrix, i, 6, i % 2 === 0);
  }

  setModule(matrix, 8, SIZE - 8, true);

  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      matrix.reserved[8][i] = true;
      matrix.reserved[i][8] = true;
    }
  }
  for (let i = SIZE - 8; i < SIZE; i += 1) {
    matrix.reserved[8][i] = true;
    matrix.reserved[i][8] = true;
  }
}

function addData(matrix: ReturnType<typeof makeMatrix>, codewords: number[]) {
  const bits = codewords.flatMap((byte) =>
    Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1)
  );
  let bitIndex = 0;
  let upward = true;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }

    for (let i = 0; i < SIZE; i += 1) {
      const row = upward ? SIZE - 1 - i : i;
      for (let offset = 0; offset < 2; offset += 1) {
        const cc = col - offset;
        if (!matrix.reserved[row][cc]) {
          const masked = Boolean(bits[bitIndex] ?? 0) !== ((row + cc) % 2 === 0);
          setModule(matrix, row, cc, masked, false);
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }
}

function bchFormatBits(format: number) {
  let value = format << 10;
  const generator = 0x537;

  for (let i = 14; i >= 10; i -= 1) {
    if (((value >>> i) & 1) !== 0) {
      value ^= generator << (i - 10);
    }
  }

  return ((format << 10) | value) ^ 0x5412;
}

function addFormatBits(matrix: ReturnType<typeof makeMatrix>) {
  const bits = bchFormatBits(0b01000);

  for (let i = 0; i <= 5; i += 1) setModule(matrix, 8, i, ((bits >>> i) & 1) !== 0);
  setModule(matrix, 8, 7, ((bits >>> 6) & 1) !== 0);
  setModule(matrix, 8, 8, ((bits >>> 7) & 1) !== 0);
  setModule(matrix, 7, 8, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i += 1) setModule(matrix, 14 - i, 8, ((bits >>> i) & 1) !== 0);

  for (let i = 0; i < 8; i += 1) setModule(matrix, SIZE - 1 - i, 8, ((bits >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i += 1) setModule(matrix, 8, SIZE - 15 + i, ((bits >>> i) & 1) !== 0);
}

export function createQrSvg(value: string, moduleSize = 8) {
  const data = encodeBytes(value);
  const codewords = [...data, ...rsRemainder(data)];
  const matrix = makeMatrix();
  addFunctionPatterns(matrix);
  addData(matrix, codewords);
  addFormatBits(matrix);

  const quiet = 4;
  const size = (SIZE + quiet * 2) * moduleSize;
  const rects: string[] = [
    `<rect width="${size}" height="${size}" fill="white"/>`
  ];

  matrix.modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) {
        rects.push(
          `<rect x="${(c + quiet) * moduleSize}" y="${(r + quiet) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`
        );
      }
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Device QR code">${rects.join("")}</svg>`;
}
