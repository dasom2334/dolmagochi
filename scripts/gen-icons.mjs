/**
 * PWA 아이콘 코드 생성 — 게임의 픽셀 돌(RockSprite 팔레트)을 도트로 렌더해 PNG로.
 * 실행: node scripts/gen-icons.mjs → public/icons/*.png
 * 외부 이미지 없이 코드로만. image-rendering: pixelated 느낌을 위해 nearest-neighbor 스케일.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(OUT, { recursive: true });

// 게임 팔레트
const BG = [0x26, 0x20, 0x31];
const SHADOW = [0x0d, 0x0d, 0x16];
const L = [0xb4, 0xb4, 0xc2];
const M1 = [0xa5, 0xa5, 0xb4];
const M2 = [0x9a, 0x9a, 0xaa];
const D = [0x8f, 0x8f, 0xa0];
const _ = null;

// 픽셀 돌 (10칸 폭) — 위로 갈수록 밝게, 아래가 넓은 돌 실루엣
const ROCK = [
  [_, _, _, L, L, L, L, _, _, _],
  [_, _, M1, M1, M1, M1, M1, M1, _, _],
  [_, M2, M2, M2, M2, M2, M2, M2, M2, _],
  [D, D, D, D, D, D, D, D, D, D],
];
const GRID_W = 10;
const GRID_H = ROCK.length;

/** size×size RGBA 버퍼에 돌+바닥 그림자를 그린다. maskable이면 안전영역(중앙 60%)에 배치. */
function render(size, maskable) {
  const png = new PNG({ width: size, height: size });
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  // 배경
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) put(x, y, BG);

  const content = Math.floor(size * (maskable ? 0.62 : 0.82));
  const cell = Math.floor(content / GRID_W); // 정수 셀 → 또렷한 도트
  const rockW = cell * GRID_W;
  const rockH = cell * GRID_H;
  const ox = Math.floor((size - rockW) / 2);
  const oy = Math.floor((size - rockH) / 2) + Math.floor(cell * 0.5); // 약간 아래로

  // 바닥 그림자 (돌 바로 아래 얇은 어두운 바)
  const floorY = oy + rockH;
  const floorH = Math.max(2, Math.floor(cell * 0.5));
  for (let y = floorY; y < floorY + floorH; y++)
    for (let x = ox; x < ox + rockW; x++) put(x, y, SHADOW);

  // 돌
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const c = ROCK[gy][gx];
      if (!c) continue;
      for (let dy = 0; dy < cell; dy++)
        for (let dx = 0; dx < cell; dx++)
          put(ox + gx * cell + dx, oy + gy * cell + dy, c);
    }
  }
  return PNG.sync.write(png);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon-180.png', 180, false],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(resolve(OUT, name), render(size, maskable));
  console.log(`✔ ${name} (${size}×${size}${maskable ? ', maskable' : ''})`);
}
