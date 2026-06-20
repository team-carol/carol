// mymai bot avatar (512x512)
import { Jimp, JimpMime } from "jimp";

const W = 512, C = W / 2;

const img = new Jimp({ width: W, height: W, color: 0x0a0014ff });

// Radial gradient: dark center → deeper edge
img.scan((x, y, idx) => {
  const dx = (x - C) / C, dy = (y - C) / C;
  const d = Math.sqrt(dx * dx + dy * dy);
  const t = d * d * 0.85;
  const v = Math.round(18 - t * 16);
  img.bitmap.data[idx] = v;
  img.bitmap.data[idx + 1] = Math.round(v * 0.35);
  img.bitmap.data[idx + 2] = Math.round(v * 0.75);
  img.bitmap.data[idx + 3] = 255;
});

// Ring 1: outer thin ring
ring(200, 204, 0x6a2c91a0);
// Ring 2: mid ring
ring(180, 183, 0x8a4db280);
// Ring 3: inner accent
ring(160, 163, 0xa368c870);

// Solid center circle
circle(C, C, 58, 0x9c4fdfff);
// Inner glow ring
ring(58, 62, 0xbf7eff60);

// "M" letterform (clean sans-serif feel, pixel-perfect grid)
const m = [
//  ██  ██
//  ███ ██
//  ██████
//  ██ ███
//  ██  ██
  [0,1,1,0,0,1,1],
  [0,1,1,1,0,1,1],
  [0,1,1,1,1,1,1],
  [0,1,1,0,1,1,1],
  [0,1,1,0,0,1,1],
];
const mx = C - 32, my = C - 30;
const cell = 10;
for (let row = 0; row < m.length; row++) {
  for (let col = 0; col < m[row].length; col++) {
    if (!m[row][col]) continue;
    const x0 = mx + col * cell;
    const y0 = my + row * cell;
    for (let dy = 0; dy < cell; dy++) {
      for (let dx = 0; dx < cell; dx++) {
        const px = x0 + dx, py = y0 + dy;
        if (px >= 0 && px < W && py >= 0 && py < W) {
          const i = (py * W + px) << 2;
          img.bitmap.data[i] = 255;
          img.bitmap.data[i + 1] = 255;
          img.bitmap.data[i + 2] = 255;
          img.bitmap.data[i + 3] = 255;
        }
      }
    }
  }
}

// Large outer ring (thin, elegant)
ring(244, 248, 0x6a2c9140);

// Noise grain (subtle texture)
for (let i = 0; i < W * W * 0.05; i++) {
  const x = Math.floor(Math.random() * W);
  const y = Math.floor(Math.random() * W);
  const idx = (y * W + x) << 2;
  const n = Math.floor(Math.random() * 15) - 7;
  img.bitmap.data[idx] = Math.max(0, Math.min(255, img.bitmap.data[idx] + n));
  img.bitmap.data[idx + 1] = Math.max(0, Math.min(255, img.bitmap.data[idx + 1] + n));
  img.bitmap.data[idx + 2] = Math.max(0, Math.min(255, img.bitmap.data[idx + 2] + n));
}

await img.write("avatar.png", JimpMime.png);
console.log("avatar.png created");

function circle(cx, cy, r, color) {
  const a = (color >> 24) & 0xff;
  const cr = (color >> 16) & 0xff, cg = (color >> 8) & 0xff, cb = color & 0xff;
  const rr = Math.ceil(r);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= W || py < 0 || py >= W) continue;
      const i = (py * W + px) << 2;
      const bg = img.bitmap.data[i + 3];
      img.bitmap.data[i] = _blend(img.bitmap.data[i], cr, a, bg);
      img.bitmap.data[i + 1] = _blend(img.bitmap.data[i + 1], cg, a, bg);
      img.bitmap.data[i + 2] = _blend(img.bitmap.data[i + 2], cb, a, bg);
      img.bitmap.data[i + 3] = Math.min(255, bg + a);
    }
  }
}

function ring(r1, r2, color) {
  const a = (color >> 24) & 0xff;
  const cr = (color >> 16) & 0xff, cg = (color >> 8) & 0xff, cb = color & 0xff;
  const o = Math.ceil(r2);
  for (let dy = -o; dy <= o; dy++) {
    for (let dx = -o; dx <= o; dx++) {
      const d = dx * dx + dy * dy;
      if (d < r1 * r1 || d > r2 * r2) continue;
      const px = C + dx, py = C + dy;
      if (px < 0 || px >= W || py < 0 || py >= W) continue;
      const i = (py * W + px) << 2;
      const bg = img.bitmap.data[i + 3];
      img.bitmap.data[i] = _blend(img.bitmap.data[i], cr, a, bg);
      img.bitmap.data[i + 1] = _blend(img.bitmap.data[i + 1], cg, a, bg);
      img.bitmap.data[i + 2] = _blend(img.bitmap.data[i + 2], cb, a, bg);
      img.bitmap.data[i + 3] = Math.min(255, bg + a);
    }
  }
}

function _blend(bg, fg, a, ba) {
  return Math.round((fg * a + bg * (255 - a)) / 255);
}
