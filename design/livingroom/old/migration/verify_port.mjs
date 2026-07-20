// JS 포팅이 Python 생성기와 **같은 결과**를 내는지 대조한다.
// 브라우저 없이 검증하려고 만든 것 — 화면을 못 볼 때의 안전망.
//   node tools/verify_port.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateGroups } from '../scene/generate.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const ref = JSON.parse(readFileSync(join(HERE, '_geom_ref.json'), 'utf8'));
const got = generateGroups();

const key = (r) => r.slice(0, 5).join(',') + (r[5] !== undefined ? ',' + r[5] : '');
let bad = 0;

// 나무는 겨울 처리를 위해 줄기·잎으로 나눠 내보내므로 합쳐서 대조한다
const merged = { ...got,
  'tree-v1': [...(got['tree-v1-trunk']||[]), ...(got['tree-v1-leaves']||[])],
  'tree-v2': [...(got['tree-v2-trunk']||[]), ...(got['tree-v2-leaves']||[])] };

for (const gid of Object.keys(ref)) {
  const a = ref[gid], b = merged[gid];
  if (!b) { console.log(`✗ ${gid}: JS에 없음`); bad++; continue; }
  if (a.length !== b.length) {
    console.log(`✗ ${gid}: rect 수 다름  py=${a.length} js=${b.length}`);
    bad++;
  }
  // 순서 무관 비교 (그리기 순서는 그룹 내에서 겹침이 없으면 무의미)
  const sa = a.map(key).sort(), sb = b.map(key).sort();
  const miss = sa.filter((k, i) => k !== sb[i]).slice(0, 3);
  if (miss.length) {
    const idx = sa.findIndex((k, i) => k !== sb[i]);
    console.log(`✗ ${gid}: 첫 불일치 #${idx}\n    py=${sa[idx]}\n    js=${sb[idx]}`);
    bad++;
  } else if (a.length === b.length) {
    console.log(`✓ ${gid}  ${a.length} rects 일치`);
  }
}

console.log(bad === 0 ? '\n포팅 검증 통과 — Python과 동일' : `\n불일치 ${bad}개 그룹`);
process.exit(bad === 0 ? 0 : 1);
