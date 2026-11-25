import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal CRC32 + PNG encoder (RGBA)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance helpers for crisp anti-aliased vector rendering
function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function blendPixel(buf, idx, r, g, b, a) {
  const alpha = Math.max(0, Math.min(1, a));
  const inv = 1 - alpha;
  buf[idx] = Math.round(r * alpha + buf[idx] * inv);
  buf[idx + 1] = Math.round(g * alpha + buf[idx + 1] * inv);
  buf[idx + 2] = Math.round(b * alpha + buf[idx + 2] * inv);
  buf[idx + 3] = Math.round(Math.min(255, alpha * 255 + buf[idx + 3] * inv));
}

function renderIconCanvas(width, height, options = {}) {
  const {
    roundMask = false,
    transparentBg = false,
    isSplash = false,
    iconScale = 1,
  } = options;

  const rgba = Buffer.alloc(width * height * 4);
  const bgR = isSplash ? 13 : 17;
  const bgG = isSplash ? 14 : 19;
  const bgB = isSplash ? 17 : 24;

  const minDim = Math.min(width, height) * iconScale;
  const cx = width / 2;
  const cy = height / 2;
  const aa = 1.5 / minDim;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = (x + 0.5 - cx) / minDim; // normalized [-0.5, 0.5]
      const ny = (y + 0.5 - cy) / minDim;

      if (!transparentBg) {
        if (roundMask) {
          const dCircle = Math.hypot(nx, ny) - 0.49;
          const cov = Math.max(0, Math.min(1, 0.5 - dCircle / aa));
          rgba[idx] = bgR;
          rgba[idx + 1] = bgG;
          rgba[idx + 2] = bgB;
          rgba[idx + 3] = Math.round(cov * 255);
        } else if (!isSplash) {
          const dBg = sdRoundedBox(nx, ny, 0.48, 0.48, 0.19);
          const cov = Math.max(0, Math.min(1, 0.5 - dBg / aa));
          rgba[idx] = bgR;
          rgba[idx + 1] = bgG;
          rgba[idx + 2] = bgB;
          rgba[idx + 3] = Math.round(cov * 255);
        } else {
          rgba[idx] = bgR;
          rgba[idx + 1] = bgG;
          rgba[idx + 2] = bgB;
          rgba[idx + 3] = 255;
        }
      }

      // Subtle amber outer ring on icon/splash badge
      const dRing = Math.abs(sdRoundedBox(nx, ny, 0.43, 0.43, 0.16)) - 0.012;
      const ringCov = Math.max(0, Math.min(1, 0.5 - dRing / aa));
      if (ringCov > 0 && !transparentBg) {
        blendPixel(rgba, idx, 245, 158, 11, ringCov * (isSplash ? 0.32 : 0.35));
      }

      // Studio microphone capsule (amber #F59E0B)
      const dMic = sdRoundedBox(nx, ny + 0.08, 0.115, 0.185, 0.115);
      const micCov = Math.max(0, Math.min(1, 0.5 - dMic / aa));
      if (micCov > 0) {
        // Subtle warm highlight toward top of capsule
        const grad = Math.max(0, Math.min(1, 0.5 - (ny + 0.08) * 2.5));
        const mr = Math.round(245 + 7 * grad);
        const mg = Math.round(158 + 30 * grad);
        const mb = Math.round(11 + 25 * grad);
        blendPixel(rgba, idx, mr, mg, mb, micCov);
      }

      // Microphone grille lines (subtle obsidian slits)
      if (micCov > 0.5) {
        for (const gy of [-0.14, -0.09, -0.04]) {
          const dSlit = sdSegment(nx, ny, -0.055, gy, 0.055, gy) - 0.008;
          const slitCov = Math.max(0, Math.min(1, 0.5 - dSlit / aa));
          if (slitCov > 0) {
            blendPixel(rgba, idx, 17, 19, 24, slitCov * 0.45);
          }
        }
      }

      // U-shaped cradle arc (alabaster #F4F5F7)
      let dArc = 999;
      if (ny >= -0.02) {
        dArc = Math.abs(Math.hypot(nx, ny + 0.02) - 0.205) - 0.024;
      } else {
        dArc = Math.min(
          Math.hypot(nx + 0.205, ny + 0.02) - 0.024,
          Math.hypot(nx - 0.205, ny + 0.02) - 0.024
        );
      }
      const arcCov = Math.max(0, Math.min(1, 0.5 - dArc / aa));
      if (arcCov > 0) {
        blendPixel(rgba, idx, 244, 245, 247, arcCov);
      }

      // Stem + Base
      const dStem = sdSegment(nx, ny, 0, 0.185, 0, 0.305) - 0.024;
      const dBase = sdSegment(nx, ny, -0.115, 0.305, 0.115, 0.305) - 0.024;
      const standCov = Math.max(0, Math.min(1, 0.5 - Math.min(dStem, dBase) / aa));
      if (standCov > 0) {
        blendPixel(rgba, idx, 244, 245, 247, standCov);
      }
    }
  }

  return encodePng(width, height, rgba);
}

// Pack multiple PNG frames into a standard Windows .ico file
function encodeIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;

  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.data)]);
}

function writeOut(relPath, buf) {
  const full = path.resolve(process.cwd(), relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);
}

// 1. Desktop / Electron icons
console.log('Generating Windows & Desktop icons...');
const icon512 = renderIconCanvas(512, 512);
writeOut('build/icon.png', icon512);
writeOut('public/icon.png', icon512);

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoFrames = icoSizes.map((s) => ({ size: s, data: renderIconCanvas(s, s) }));
writeOut('build/icon.ico', encodeIco(icoFrames));

// 2. Android launcher icons (same exact brand emblem)
console.log('Generating Android launcher icons...');
const androidDensities = [
  { name: 'mdpi', size: 48, fg: 108 },
  { name: 'hdpi', size: 72, fg: 162 },
  { name: 'xhdpi', size: 96, fg: 216 },
  { name: 'xxhdpi', size: 144, fg: 324 },
  { name: 'xxxhdpi', size: 192, fg: 432 },
];

for (const d of androidDensities) {
  const base = `android/app/src/main/res/mipmap-${d.name}`;
  if (fs.existsSync(path.resolve(process.cwd(), base))) {
    writeOut(`${base}/ic_launcher.png`, renderIconCanvas(d.size, d.size));
    writeOut(`${base}/ic_launcher_round.png`, renderIconCanvas(d.size, d.size, { roundMask: true }));
    writeOut(
      `${base}/ic_launcher_foreground.png`,
      renderIconCanvas(d.fg, d.fg, { transparentBg: true, iconScale: 0.62 })
    );
  }
}

// 3. Android dark studio splash screens
console.log('Generating Android splash screens...');
const splashTargets = [
  { dir: 'drawable', w: 480, h: 480 },
  { dir: 'drawable-port-mdpi', w: 320, h: 480 },
  { dir: 'drawable-port-hdpi', w: 480, h: 800 },
  { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
  { dir: 'drawable-land-mdpi', w: 480, h: 320 },
  { dir: 'drawable-land-hdpi', w: 800, h: 480 },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
  { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
  { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
];

for (const s of splashTargets) {
  const dirPath = `android/app/src/main/res/${s.dir}`;
  if (fs.existsSync(path.resolve(process.cwd(), dirPath))) {
    writeOut(`${dirPath}/splash.png`, renderIconCanvas(s.w, s.h, { isSplash: true, iconScale: 0.34 }));
  }
}

console.log('All Windows & Android icons + splash screens generated cleanly!');
