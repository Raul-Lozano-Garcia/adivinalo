const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUTS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

const QUESTION_MARK = [
  '001111100',
  '011000110',
  '110000011',
  '000000011',
  '000000110',
  '000001100',
  '000011000',
  '000011000',
  '000000000',
  '000011000',
  '000011000'
];

const BG_START = [15, 27, 23];
const BG_END = [13, 13, 13];
const GLOW = [29, 58, 48];
const GREEN = [0, 255, 136];
const YELLOW = [255, 214, 0];
const RED = [255, 45, 85];
const DARK = [18, 18, 18];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + ((b[0] - a[0]) * t)),
    Math.round(a[1] + ((b[1] - a[1]) * t)),
    Math.round(a[2] + ((b[2] - a[2]) * t))
  ];
}

function blendPixel(pixels, size, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;

  const index = ((y * size) + x) * 4;
  const srcA = alpha / 255;
  const dstA = pixels[index + 3] / 255;
  const outA = srcA + (dstA * (1 - srcA));

  if (!outA) return;

  pixels[index] = Math.round(((color[0] * srcA) + (pixels[index] * dstA * (1 - srcA))) / outA);
  pixels[index + 1] = Math.round(((color[1] * srcA) + (pixels[index + 1] * dstA * (1 - srcA))) / outA);
  pixels[index + 2] = Math.round(((color[2] * srcA) + (pixels[index + 2] * dstA * (1 - srcA))) / outA);
  pixels[index + 3] = Math.round(outA * 255);
}

function fillBackground(pixels, size) {
  const glowX = size * 0.35;
  const glowY = size * 0.28;
  const glowRadius = size * 0.72;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gradientT = (x + y) / ((size - 1) * 2);
      let color = mixColor(BG_START, BG_END, gradientT);

      const dx = x - glowX;
      const dy = y - glowY;
      const glowStrength = clamp(1 - (Math.hypot(dx, dy) / glowRadius), 0, 1);
      color = mixColor(color, GLOW, glowStrength * 0.32);

      const vignette = clamp(Math.hypot(x - (size / 2), y - (size / 2)) / (size * 0.78), 0, 1);
      color = mixColor(color, BG_END, vignette * 0.38);

      blendPixel(pixels, size, x, y, color, 255);
    }
  }
}

function drawBadge(pixels, size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.33;
  const glowRadius = radius * 1.24;

  for (let y = Math.floor(cy - glowRadius); y <= Math.ceil(cy + glowRadius); y++) {
    for (let x = Math.floor(cx - glowRadius); x <= Math.ceil(cx + glowRadius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);

      if (distance <= radius) {
        const colorT = clamp((dy + radius) / (radius * 2), 0, 1);
        let color = mixColor(GREEN, YELLOW, colorT * 0.92);
        const highlight = clamp(1 - (Math.hypot(dx + (radius * 0.25), dy + (radius * 0.3)) / (radius * 1.1)), 0, 1);
        color = mixColor(color, [255, 255, 255], highlight * 0.16);
        blendPixel(pixels, size, x, y, color, 255);
      } else if (distance <= glowRadius) {
        const edgeT = 1 - ((distance - radius) / (glowRadius - radius));
        blendPixel(pixels, size, x, y, GREEN, Math.round(edgeT * 46));
      }
    }
  }

  const innerRadius = radius * 0.76;
  for (let y = Math.floor(cy - innerRadius); y <= Math.ceil(cy + innerRadius); y++) {
    for (let x = Math.floor(cx - innerRadius); x <= Math.ceil(cx + innerRadius); x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= innerRadius) {
        blendPixel(pixels, size, x, y, DARK, Math.round((1 - (distance / innerRadius)) * 22));
      }
    }
  }
}

function drawTriangle(pixels, size, centerX, tipY, width, height, color, direction) {
  const halfWidth = width / 2;
  const baseY = direction === 'up' ? tipY + height : tipY - height;

  for (let y = Math.floor(Math.min(tipY, baseY)); y <= Math.ceil(Math.max(tipY, baseY)); y++) {
    const progress = height === 0 ? 0 : Math.abs((y - tipY) / height);
    const span = halfWidth * progress;
    for (let x = Math.floor(centerX - span); x <= Math.ceil(centerX + span); x++) {
      blendPixel(pixels, size, x, y, color, 210);
    }
  }
}

function drawBlock(pixels, size, startX, startY, blockSize, color, alpha) {
  const radius = Math.max(1, Math.round(blockSize * 0.18));

  for (let y = 0; y < blockSize; y++) {
    for (let x = 0; x < blockSize; x++) {
      const distX = Math.max(0, Math.abs(x - (blockSize / 2)) - ((blockSize / 2) - radius));
      const distY = Math.max(0, Math.abs(y - (blockSize / 2)) - ((blockSize / 2) - radius));
      if ((distX * distX) + (distY * distY) <= radius * radius) {
        blendPixel(pixels, size, startX + x, startY + y, color, alpha);
      }
    }
  }
}

function drawQuestionMark(pixels, size) {
  const cell = Math.max(6, Math.round(size * 0.04));
  const markWidth = QUESTION_MARK[0].length * cell;
  const markHeight = QUESTION_MARK.length * cell;
  const offsetX = Math.round((size - markWidth) / 2);
  const offsetY = Math.round(size * 0.17);
  const shadowOffset = Math.max(2, Math.round(cell * 0.12));

  for (let row = 0; row < QUESTION_MARK.length; row++) {
    for (let col = 0; col < QUESTION_MARK[row].length; col++) {
      if (QUESTION_MARK[row][col] !== '1') continue;
      const x = offsetX + (col * cell);
      const y = offsetY + (row * cell);
      drawBlock(pixels, size, x + shadowOffset, y + shadowOffset, cell, [0, 0, 0], 40);
      drawBlock(pixels, size, x, y, cell, DARK, 255);
    }
  }
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  fillBackground(pixels, size);
  drawBadge(pixels, size);
  drawTriangle(pixels, size, size / 2, size * 0.11, size * 0.11, size * 0.06, GREEN, 'up');
  drawTriangle(pixels, size, size / 2, size * 0.89, size * 0.11, size * 0.06, RED, 'down');
  drawQuestionMark(pixels, size);
  return pixels;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const sourceStart = y * stride;
    const targetStart = y * (stride + 1);
    raw[targetStart] = 0;
    pixels.copy(raw, targetStart + 1, sourceStart, sourceStart + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    createChunk('IHDR', header),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

for (const output of OUTPUTS) {
  const pixels = render(output.size);
  const png = encodePng(output.size, pixels);
  fs.writeFileSync(path.join(__dirname, output.name), png);
  process.stdout.write(`${output.name}\n`);
}
