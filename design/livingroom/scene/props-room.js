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
  // 돌 방석 — 창턱 나무·불빛과 같이 놓이므로 웜톤(테라코타)
  '--cu0': '#6b3826', '--cu1': '#9a5533', '--cu2': '#c47c4a',   // 방석(웜)
  // 가구 나무 — 채도를 올리면 보라 계열 방에서 혼자 튄다. 레퍼런스처럼 **눌린 갈색**으로.
  '--wd0': '#33262a', '--wd1': '#4d3b36', '--wd2': '#6a5347',   // 나무(책장·창턱선반)
  // 벽난로 돌 — 나무와 같은 계열이되 조금 더 회색으로(레퍼런스도 둘이 가깝다)
  '--st0': '#2b2228', '--st1': '#463a3d', '--st2': '#61504c', '--st3': '#7a6357',
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
  // 돌 방석 — 창턱 돌(x53~62, 밑변 y35)이 **파묻힌** 것처럼 보여야 한다.
  // 평평한 깔개를 돌 밑에 깔면 그냥 돌 밑의 판이다. 푹신함은 두 가지로 만든다:
  //   ① 위로 볼록한 실루엣(가운데가 높고 가장자리로 흘러내림)
  //   ② 앞 테두리가 **돌 밑동을 덮는다**(p-cushion-front, 돌보다 나중에 그린다)
  'p-cushion': [49, 31, [
    '....oooooooo....',
    '..oommmmmmmmoo..',
    '.ommmmmmmmmmmmo.',
    'ommmmmmmmmmmmmmo',
    'ommmmmmmmmmmmmmo',
  ], { o: '--cu0', m: '--cu1' }],

  // 돌 양옆으로 부풀어 오른 부분 + 앞 테두리. 돌보다 **나중에** 그려 밑동을 덮는다
  'p-cushion-front': [49, 34, [
    'ommh..........mo',
    'oommhhhhhhhhmmoo',
  ], { o: '--cu0', m: '--cu1', h: '--cu2' }],




  // 담요 — 두 가지 모습. 책을 읽는 동안은 돌을 감싸고, 아니면 옆에 개어 둔다.
  // 개어 둔 모습: 러그 오른쪽. 접힌 층이 보여야 '개어 둔 것'으로 읽힌다.
  'p-blanket': [58, 62, [
    '.ffffffffff.',
    'fgggggggggf',
    'fgFFFFFFFFgf',
    'fgggggggggf',
    '.dddddddddd.',
  ], { f: '--fb0', g: '--fb1', F: '--fb2', d: '--fb0' }],

  // 감싼 모습: 러그 돌(x40~54, 밑변 y61)의 양옆을 타고 올라와 밑에 고인다.
  // 돌보다 **나중에** 그려야 감싼 것으로 보인다(뒤에 그리면 돌 뒤의 천일 뿐).
  // 가운데를 비워 돌이 그 사이로 드러나게 한다.
  'p-blanket-wrap': [37, 56, [
    '.....ff.......ff.....',
    '....fgg.......ggf....',
    '...fggg.......gggf...',
    '..fgggg.......ggggf..',
    '.fggggg.......gggggf.',
    '.fgggggFFFFFggggggggf',
    'fgggggggggggggggggggf',
    '.ddddddddddddddddddd.',
  ], { f: '--fb0', g: '--fb1', F: '--fb2', d: '--fb0' }],







  // 찻잔 — 돌 방석 왼쪽, 창턱 선반 위(밑변 y35). 오른쪽은 스탠드와 겹친다.
  // 빈 잔은 **안쪽 벽(밝음)과 바닥(그늘)**이 보여야 비었다고 읽힌다 —
  // 안을 통째로 어둡게 칠하면 그냥 검은 구멍이다.
  'p-cup': [40, 31, [
    '.tttttt..',
    'cIIIIIIch',
    'cbeeeebcH',
    '.cbbbbc..',
    'ssssssss.',
  ], { t: '--cer2', I: '--cer1', e: '--st0', c: '--cer1', b: '--cer0',
       h: '--cer1', H: '--cer0', s: '--cer0' }],

  // 내용물 — 채운 상태에만. 잔 안쪽을 덮는다
  'p-cup-tea': [41, 32, [
    'LLLLLL',
    '.LLLL.',
  ], { L: '--lqt' }],

  // 김 — 채운 상태에만. 오르며 옅어진다
  'p-cup-steam': [41, 27, [
    '..w..',
    '.w.w.',
    'w...w',
    '.w.w.',
  ], { w: '--cer2' }],

  // 물컵 (대사: restAct.water / act.nurse)
  'p-waterglass': [14, 28, [
    'gg',
    'gg',
    'ww',
    'GG',
  ], { g: '--gl1', w: '--lqw', G: '--gl0' }],

  // 풍경(風磬) — 창 오른쪽 벽. 창을 열면 **대롱만** 흔들려야 하므로 따로 뗀다
  'p-windchime': [69, 3, [
    '..W..',
    '.WWW.',
    'WWWWW',
  ], { W: '--mt0' }],

  'p-windchime-tubes': [69, 6, [
    '..t..',
    '..t..',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '..p..',
    '..p..',
  ], { t: '--wd0', m: '--mt2', p: '--wd1' }],

  // 창턱에 앉은 새 (대사: fore.bird). 찻잔 자리와 겹쳐 방석 오른쪽으로 옮김
  'p-bird': [65, 31, [
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
