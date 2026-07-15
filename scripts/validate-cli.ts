/**
 * 데이터 검증 CLI — `npm run validate` (vite-node).
 * 실데이터 + ko 카탈로그를 검증하고, 에러가 있으면 종료 코드 1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameData } from '../src/store/gameStore';
import { validateGameData, findDuplicateKeys } from './validate-data';

const koPath = fileURLToPath(new URL('../src/data/locales/ko.json', import.meta.url));
const report = validateGameData(gameData, gameData.text);
const dups = findDuplicateKeys(readFileSync(koPath, 'utf-8'));

for (const d of dups) report.errors.push(`카탈로그 중복 키 "${d}" (ko.json)`);

const line = (s: string) => process.stdout.write(s + '\n');

if (report.warnings.length) {
  line(`\n⚠  경고 ${report.warnings.length}건`);
  report.warnings.forEach((w) => line(`   - ${w}`));
}
if (report.todos.length) {
  line(`\n📝 [TODO] 슬롯 ${report.todos.length}개 (미작성 텍스트)`);
  report.todos.forEach((t) => line(`   - ${t}`));
}
if (report.errors.length) {
  line(`\n❌ 에러 ${report.errors.length}건`);
  report.errors.forEach((e) => line(`   - ${e}`));
  line('');
  process.exit(1);
}
line(`\n✅ 검증 통과 — 에러 0, 경고 ${report.warnings.length}, TODO ${report.todos.length}\n`);
