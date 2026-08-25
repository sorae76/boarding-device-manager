import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";

const qrSvgUrl = new URL("../lib/qr/svg.ts", import.meta.url).href;
const { createQrSvg }: typeof import("../lib/qr/svg") = await import(qrSvgUrl);

const version = 5;
const matrixSize = 17 + version * 4;
const quietZone = 4;
const moduleSize = 8;
const imageSize = (matrixSize + quietZone * 2) * moduleSize;
const representativeUrl =
  "https://boarding-device-manager.vercel.app/device-pass/123e4567-e89b-42d3-a456-426614174000";

function generatedSymbol(value: string) {
  const svg = createQrSvg(value, moduleSize);
  const modules = Array.from({ length: matrixSize }, () =>
    new Array(matrixSize).fill(false) as boolean[]
  );
  const pixels = new Uint8ClampedArray(imageSize * imageSize * 4);
  pixels.fill(255);
  const darkRectPattern =
    /<rect x="(\d+)" y="(\d+)" width="8" height="8" fill="black"\/>/g;

  for (const match of svg.matchAll(darkRectPattern)) {
    const pixelX = Number(match[1]);
    const pixelY = Number(match[2]);
    const x = pixelX / moduleSize - quietZone;
    const y = pixelY / moduleSize - quietZone;
    assert.ok(x >= 0 && x < matrixSize && y >= 0 && y < matrixSize);
    modules[y][x] = true;

    for (let row = pixelY; row < pixelY + moduleSize; row += 1) {
      for (let column = pixelX; column < pixelX + moduleSize; column += 1) {
        const offset = (row * imageSize + column) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
    }
  }

  return { modules, pixels, svg };
}

function formatCopies(modules: boolean[][]) {
  const bit = (x: number, y: number) => Number(modules[y][x]);
  let first = 0;
  let second = 0;

  for (let i = 0; i <= 5; i += 1) first |= bit(8, i) << i;
  first |= bit(8, 7) << 6;
  first |= bit(8, 8) << 7;
  first |= bit(7, 8) << 8;
  for (let i = 9; i < 15; i += 1) first |= bit(14 - i, 8) << i;

  for (let i = 0; i < 8; i += 1) second |= bit(matrixSize - 1 - i, 8) << i;
  for (let i = 8; i < 15; i += 1) second |= bit(8, matrixSize - 15 + i) << i;

  return { first, second };
}

test("Device Pass QR is standards-decodable with correct format information", () => {
  assert.equal(new TextEncoder().encode(representativeUrl).length, 91);
  const { modules, pixels } = generatedSymbol(representativeUrl);
  const formats = formatCopies(modules);
  const decoded = jsQR(pixels, imageSize, imageSize);

  assert.equal(formats.first, 0x77c4);
  assert.equal(formats.second, 0x77c4);
  assert.equal(formats.first, formats.second);
  assert.equal(modules[29][8], true);
  assert.equal(decoded?.data, representativeUrl);
});

test("Device Pass SVG preserves its quiet zone and accessible black-on-white rendering", () => {
  const { svg } = generatedSymbol(representativeUrl);
  const darkCoordinates = Array.from(
    svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="8" height="8" fill="black"\/>/g),
    (match) => ({ x: Number(match[1]), y: Number(match[2]) })
  );
  const quietPixels = quietZone * moduleSize;

  assert.match(svg, new RegExp(`viewBox="0 0 ${imageSize} ${imageSize}"`));
  assert.match(svg, new RegExp(`<rect width="${imageSize}" height="${imageSize}" fill="white"/>`));
  assert.match(svg, /fill="black"/);
  assert.match(svg, /aria-label="Device QR code"/);
  assert.ok(darkCoordinates.length > 0);
  assert.ok(darkCoordinates.every(({ x, y }) =>
    x >= quietPixels &&
    y >= quietPixels &&
    x < imageSize - quietPixels &&
    y < imageSize - quietPixels
  ));
});

test("Device Pass QR capacity is explicit and never silently truncates", () => {
  assert.doesNotThrow(() => createQrSvg(representativeUrl));
  assert.throws(
    () => createQrSvg("x".repeat(107)),
    /QR payload is too long for the local encoder/
  );
});
