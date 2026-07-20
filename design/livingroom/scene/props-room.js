// 상점 소품 · 대사에 등장하는 사물 — 아트 좌표(96×72) 기준 수작화.
//
// 이 크기(대개 10px 안팎)에서는 절차 생성이 오히려 부정확하다. 문자 격자로 찍고
// 문자→팔레트 슬롯 맵을 따로 둔다. 슬롯이라 시간·계절·날씨 오버레이를 그대로 받는다.
//
//   . = 빈칸. 그 외 문자는 각 소품의 map 이 정의한다.
//
// 배치 제약 (기획서):
//   - 창 아래(x27~66, y35~48)에는 가구를 두지 않는다
//   - 방당 대형 가구 2개까지 — 어느 걸 동시에 놓을지는 게임이 정한다
//
// 좌표는 [x, y] = 격자 왼쪽 위 모서리.

/** 공통 슬롯 — 재질별로 묶어 두면 소품이 늘어도 팔레트가 안 불어난다 */
export const PROP_SLOTS = {
  // 방석은 러그(붉은색) 위에 놓인다 — 자주색이면 러그에 묻혀 안 보인다. 청록으로.
  '--cu0': '#2b4665', '--cu1': '#436489', '--cu2': '#688cb0',   // 방석(청)
  '--cg0': '#39544c', '--cg1': '#527468', '--cg2': '#749a8b',   // 손님 방석(초록)
  '--wd0': '#402c22', '--wd1': '#63432f', '--wd2': '#87603f',   // 나무
  '--mt0': '#3f444c', '--mt1': '#666d78', '--mt2': '#949ca8',   // 금속
  '--cer0': '#7d838b', '--cer1': '#b9c0c8', '--cer2': '#e2e7ec', // 도자기
  '--lqt': '#7a4622', '--lqw': '#4a6f8e',                        // 액체(차 / 물)
  '--fb0': '#4f4059', '--fb1': '#6f5c79', '--fb2': '#8f7c98',   // 천(담요)
  '--bd0': '#3d3028', '--bd1': '#7b6450', '--bd2': '#c3ab8b',   // 새
  '--sd0': '#25563d', '--sd1': '#3f8a5c', '--sd2': '#6fb98a',   // 탄산캔
  '--gl0': '#9fb6c6', '--gl1': '#cfe0ea',                        // 유리
};

/** [x, y, 격자, 문자→슬롯] */
export const ROOM_PROPS = {
  // ── 러그 위 ────────────────────────────────────────────────
  'p-cushion': [24, 58, [
    '..ooooooooo..',
    '.ommmmmmmmmo.',
    'ommhhhhhmmmmo',
    'ommmmmmmmmmmo',
    '.ooooooooooo.',
  ], { o: '--cu0', m: '--cu1', h: '--cu2' }],

  'p-guestcushion': [56, 58, [
    '..ooooooooo..',
    '.ommmmmmmmmo.',
    'ommhhhhhmmmmo',
    'ommmmmmmmmmmo',
    '.ooooooooooo.',
  ], { o: '--cg0', m: '--cg1', h: '--cg2' }],

  // 돌이 오래 앉아 있던 자리 — 러그 결이 눌린 옅은 자국 (대사: fore.dust)
  'p-rockmark': [41, 57, [
    '..dddddddd..',
    '.dddddddddd.',
    '..dddddddd..',
  ], { d: '--cu0' }],

  // 헌책 — 바닥에 쌓아 둔 책더미
  'p-bookstack': [30, 63, [
    '.aaaaaaa.',
    'aaaaaaaaa',
    '.bbbbbbb.',
    'bbbbbbbbb',
    '.ccccccc.',
  ], { a: '--b2x0', b: '--b4x0', c: '--b6x0' }],

  // 담요 — 돌이 없는 날 개어 둔 자리 (대사: dlg.absent.care)
  'p-blanket': [56, 64, [
    '.ffffffffff.',
    'fggggggggggf',
    'fggFFFFggggf',
    '.ffffffffff.',
  ], { f: '--fb0', g: '--fb1', F: '--fb2' }],

  // ── 바닥 ──────────────────────────────────────────────────
  // 흔들의자 — 대형. 이 크기에서는 살대를 성기게 그리면 사다리로 보인다 →
  // 등받이를 통짜 실루엣으로 두고 **틈으로** 살대를 표현한다.
  'p-rockingchair': [74, 50, [
    '..WWWWWWW..',
    '..WdddddW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..WWWWWWW..',
    '.WWWWWWWWW.',
    '.WsssssssW.',
    '.WsssssssW.',
    '.WWWWWWWWW.',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '.RRRRRRRRR.',
    'R.........R',
  ], { W: '--wd2', d: '--wd0', s: '--cu1', R: '--wd1' }],

  // 선풍기 — 날개 원판 + 목 + 받침
  'p-fan': [19, 50, [
    '..mmmmm..',
    '.mMMMMMm.',
    'mMMbbbMMm',
    'mMbbbbbMm',
    'mMMbbbMMm',
    '.mMMMMMm.',
    '..mmmmm..',
    '....k....',
    '....k....',
    '....k....',
    '....k....',
    '....k....',
    '...kkk...',
    '..kkkkk..',
    '.kkkkkkk.',
  ], { m: '--mt0', M: '--mt2', b: '--mt1', k: '--mt0' }],

  // 물뿌리개 — 몸통 + 주둥이 + 손잡이
  'p-wateringcan': [92, 62, [
    '..hh......',
    '.h..h.....',
    'MMMMMM.s..',
    'MmmmmMss..',
    'MmmmmMs...',
    'MmmmmM....',
    'MMMMMM....',
  ], { M: '--mt0', m: '--mt1', h: '--mt0', s: '--mt2' }],

  // 등불 기둥 — 바닥에 세우는 등
  'p-lanternpost': [104, 44, [
    '..WW..',
    '.WLLW.',
    'WLLLLW',
    'WLffLW',
    'WLffLW',
    'WLLLLW',
    '.WLLW.',
    '..WW..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '..dd..',
    '.dddd.',
    'dddddd',
  ], { W: '--mt0', L: '--gl0', f: '--sun1', d: '--wd0' }],

  // 탄산음료 캔
  'p-soda': [22, 66, [
    'sss',
    'SSS',
    'SgS',
    'SSS',
    'sss',
  ], { s: '--sd0', S: '--sd1', g: '--sd2' }],

  // ── 벽난로 선반(맨틀) ───────────────────────────────────────
  // 벽난로가 앞으로 나오면서(generate.js BOX_FW=1.15) 맨틀은 x-7~18 로 옮겨졌고
  // 윗면이 y31~32 에 생겼다. 얹는 물건의 밑변은 y31.
  // 촛대가 왼쪽(x-4 근처)에 오므로 나머지는 오른쪽 절반에 늘어놓는다.
  // 차통 — 소모품 '따뜻한 차'의 재고 자리
  'p-tea': [4, 27, [
    '.WW.',
    'CCCC',
    'CttC',
    'CttC',
    'CCCC',
  ], { W: '--wd0', C: '--cer0', t: '--lqt' }],

  // 찻잔 — 손잡이 달린 잔 + 받침
  'p-cup': [9, 28, [
    'ccch',
    'cLLc',
    'cccc',
    'CCCC',
  ], { c: '--cer1', L: '--lqt', h: '--cer0', C: '--cer0' }],

  // 물컵 (대사: restAct.water / act.nurse)
  'p-waterglass': [14, 28, [
    'gg',
    'gg',
    'ww',
    'GG',
  ], { g: '--gl1', w: '--lqw', G: '--gl0' }],

  // ── 벽·창 ────────────────────────────────────────────────
  // 풍경(風磬) — 창 오른쪽 벽에 매단다. 아래 대롱이 바람에 흔들린다
  'p-windchime': [69, 3, [
    '..W..',
    '.WWW.',
    'WWWWW',
    '..t..',
    '..t..',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '..p..',
    '..p..',
  ], { W: '--mt0', t: '--wd0', m: '--mt2', p: '--wd1' }],

  // 창턱에 앉은 새 (대사: fore.bird)
  'p-bird': [40, 31, [
    '.BB..',
    'BBBBk',
    'bBBB.',
    '.ll..',
  ], { B: '--bd1', b: '--bd2', k: '--bd0', l: '--bd0' }],
};

/** 문자 격자 → rect. 가로 런 병합까지 여기서 한다 */
export function buildRoomProps() {
  const out = {};
  for (const [id, [ox, oy, art, map]] of Object.entries(ROOM_PROPS)) {
    const rects = [];
    art.forEach((row, j) => {
      let i = 0;
      while (i < row.length) {
        const ch = row[i];
        if (ch === '.') { i++; continue; }
        let k = i;
        while (k + 1 < row.length && row[k + 1] === ch) k++;
        const slot = map[ch];
        if (slot) rects.push([ox + i, oy + j, k - i + 1, 1, slot]);
        i = k + 1;
      }
    });
    out[id] = rects;
  }
  return out;
}
