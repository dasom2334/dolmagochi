/**
 * 튜닝 상수 전부. 기획서에 명시되지 않은 수치는 여기서만 조정한다.
 * (근거·기본값 표는 docs/plans/M1.md 참조)
 */
export const BALANCE = {
  // 정성 (기획서 명시)
  CARE_MINUTES_PER_POINT: 25,

  // 휴식 길이 (기획서 명시): [상한 분(미만), 휴식 분]
  REST_TABLE: [
    [25, 5],
    [50, 10],
    [90, 20],
    [Infinity, 30],
  ] as const,

  // 집중 세션 연출 타이밍
  AMBIENT_ROTATE_SEC: 40,
  CHOICE_FIRST_AT_SEC: 300,
  CHOICE_SECOND_AT_SEC: 1500,

  // 대화
  FORESHADOW_PROB: 0.45,

  // 추억 순간 (M11a) — 희소해야 추억답다: 세션당 최대 1회.
  // 반추 틱(자유행동 5분·그 외 10분)마다 굴려 50분 세션 발동률 ~10~18%,
  // 1회차(~66세션) 기대 획득 ~12-15개 — 절반 이상은 놓친다.
  MOMENT_PROB_PER_TICK: 0.02,
  MOMENT_PROB_REST_ACT: 0.1, // 휴식 작은 행동 1회당

  // 날씨 (M12) — 게이지 무영향. 변경은 무료(M22): 날씨·시간대·계절·소리는
  // 집중 환경을 고르는 취향 축이지 정성 소비처가 아니다.
  // 계절별 날씨 가용성·자연 변화 확률 (달력일당 1회 추첨) — 눈=겨울 필수 의존,
  // 꽃잎비=봄, 낙엽비=가을, 장대비=여름. 표에 없는 날씨는 그 계절에 선택 불가.
  WEATHER_BY_SEASON: {
    spring: [
      ['clear', 0.5],
      ['rain', 0.2],
      ['petals', 0.3],
    ],
    summer: [
      ['clear', 0.55],
      ['rain', 0.25],
      ['downpour', 0.2],
    ],
    autumn: [
      ['clear', 0.5],
      ['rain', 0.2],
      ['leaves', 0.3],
    ],
    winter: [
      ['clear', 0.6],
      ['snow', 0.4],
    ],
  } as Record<string, ReadonlyArray<readonly [string, number]>>,

  // 기억 항목 (종류별 단일 항목 — 소멸하지 않는다)
  MEMORY_WEIGHT_FLOOR: 0.5, // 감쇠 바닥값 — 이 밑으로 내려가지 않음
  MEMORY_WEIGHT_MAX: 10, // 강화 상한
  DRAW_DECAY: 0.5,
  REFLECT_INTERVAL_FREE_SEC: 300,
  REFLECT_INTERVAL_SEC: 600,
  MEMORY_WEIGHT_ACTION: 3,
  MEMORY_WEIGHT_PURCHASE: 3,
  MEMORY_WEIGHT_CHOICE: 2,

  // 애착 2축 (숨은 값, 0–100) — 안정감은 두 축의 파생값
  //   안정감 = 100 − |유기불안 − 친밀위협|,  변동성 = (유기불안 + 친밀위협) / 2
  ABANDONMENT_START: 0, // 유기불안 시작 (회피형: 아직 매인 게 없어 0)
  INTIMACY_THREAT_START: 70, // 친밀위협 시작 → 안정감 30 → 허용 친밀도 2(경계형 시작)
  ATTACH_BALANCED_GAP: 20, // |유기불안−친밀위협| 이 값 미만이면 '균형'(안정/혼란 구분)
  ATTACH_CHAOTIC_SUM: 120, // 균형이면서 합산이 이 값 이상이면 '혼란'
  ATTACH_SOOTHE: 3, // 적정/거리 존중 접근 시 두 축 동시 진정량 (세션 1회, 행동 경로만)
  ATTACH_THREAT_UP: 5, // 과한 접근 시 친밀위협 상승량

  // ── 애착 활성화 곡선 (M18): 잠복 축적 → 개막 → 위기 감쇠 ──
  // 1~2티어: 모든 축 변동 ×PRE_RATE로 조용히 쌓인다 (위기 발동은 차단).
  // 3티어 보장 잠수 = 개막 — 숨겨온 축이 급성으로 드러나고, 이후 변동률 최대.
  // 위기를 겪을수록 감쇠 — 함께 흔들려 본 사이는 웬만한 일로 흔들리지 않는다.
  ATTACH_ONSET_TIER: 3, // 이 티어의 보장 잠수가 2축의 개막 이벤트
  ATTACH_PRE_RATE: 0.25, // 개막 전 축 변동 배율 (잠복 축적)
  ATTACH_TIER_SCALE: 0.1, // 개막 후 티어당 가산 — 깊은 관계일수록 크게 흔들린다
  ATTACH_CRISIS_DECAY: 0.25, // 겪은 위기 1회당 변동률 −25%
  ATTACH_RATE_FLOOR: 0.3, // 감쇠 하한 — 무뎌져도 무감해지진 않는다
  RETREAT_SPIKE: 90, // 개막·잠수 아크: 친밀위협을 이 값까지 끌어올린다 (회피 급성)
  SICK_SPIKE: 88, // 병간호 아크: 유기불안 스파이크 (집착 급성)
  ATTACH_FORK_DELTA: 12, // 세션 포크가 미는 축 상승량 (rate 적용 전)
  ATTACH_FORK_RELIEF: 12, // 반대 축 하강량 — 상승과 같아 '이동'이다: 번갈면 중립, 치우치면 축적
  RETREAT_VOL_SCALE: 1.0, // 잠수 확률 = RETREAT_PROB × (1 + SCALE × 변동성/100)
  // 4분면 '상태 대사'는 급성일 때만 뜬다 (baseline 회피는 일반 풀 유지):
  ATTACH_CLINGY_ACUTE: 60, // 유기불안이 이 값 이상이면 집착 상태 대사
  ATTACH_AVOIDANT_ACUTE: 90, // 친밀위협이 이 값 이상이면 회피 상태 대사
  CONVERGE_STEP: 25, // 위기 루프(병간호/잠수) 매 턴 균형점으로 이동량 (상한 25%)
  // 약한 애착 표류 (개정 v4-8): 관계가 깊을수록 잃을까 불안해진다.
  // 세션마다 유기불안 += PER_TIER×티어 (+ 휴식 스킵 시 ON_SKIP).
  // 접근(세션 시작/선택지/대화)의 진정 −3이 이를 상쇄 — 성실 플레이어는 체감 0,
  // 무심·스킵 플레이어만 서서히 쌓여 유기적 위기(병간호)로 이어진다.
  // M18 재조정: 진정이 세션 1회로 줄며 1.0은 과잉(성실 플레이도 병간호 루프) —
  // 0.4 + attachRate 배율로 방치·스킵 채널만 남긴다 (시뮬 재확정).
  ATTACH_DRIFT_PER_TIER: 0.4,
  ATTACH_DRIFT_ON_SKIP: 3,
  ATTACH_RETURN_GAP: 20, // 위기 루프에서 |유기불안−친밀위협| 이 값 미만이면 복귀
  ABANDONMENT_SICK_CEILING: 85, // 유기불안이 이 값 초과면 돌이 아파짐 → 강제 병간호

  SECURITY_START: 25, // (파생 초기값 참고용 — 실제 값은 위 두 축에서 계산)
  RETREAT_GAP: 2, // 허용치 대비 이만큼 이상 초과하면 잠수 판정 (기획서 명시)
  RETREAT_PROB: 0.25, // M18 하향 — 축이 상시 살아 판정 기회 자체가 늘었다
  SECURITY_GAIN_MATCHED: 3,
  SECURITY_LOSS_BREACH: 5,

  // 잠수 (부재)
  ABSENCE_SESSIONS_MIN: 1, // 기획서 명시 1~3
  ABSENCE_SESSIONS_MAX: 3,
  RETURN_LOW_INTIMACY_MAX: 2, // 이 친밀도 이하 행동 세션만 복귀 누적에 카운트

  // 달력일 정산
  NEGLECT_DAYS_PER_REGRESS: 3, // 이 일수마다 욕구 1단계 퇴행 (하한 1, 죽지 않음)
  NEGLECT_ABANDONMENT_PER_STEP: 20, // 방치 퇴행 1스텝당 유기불안 상승 (오래 안 오면 불안해진다)

  // 상태값 공통
  STAT_MIN: 0,
  STAT_MAX: 100,

  // 욕구 게이지 (명명 분리 — 단계는 파생값)
  NEED_FILLED_THRESHOLD: 60, // 이 값 이상이면 해당 욕구 '충족' — 단계 파생 기준
  NEED_REGRESS_AMOUNT: 30, // 방치 퇴행 1스텝당 최상위 충족 욕구 하락량

  // 세션당 상한 — 90분 초과 집중은 "잠수했거나 타이머를 잊은 것"으로 취급,
  // 게이지·정성 모두 이 시점 이후로는 오르지 않는다. (휴식표 90+→30분과 정합)
  SESSION_CAP_MINUTES: 90,

  // 자유행동 (순차 자가 충족 · 개인작업)
  // selfCare 확률: 최우선 욕구(생리)가 절반 미만이면 무조건, 아니면 전단계 평균 비례.
  //   p = 첫욕구<50 ? 1 : max(FLOOR, avg(전단계)/100)  — 전단계 없으면 FLOOR.
  FREE_SELF_CARE_PROB: 0.5, // 확률 바닥값 (전단계 평균 50% 미만 구간)
  FREE_URGENT_THRESHOLD: 50, // 최우선 욕구가 이 값 미만이면 돌이 무조건 스스로 채운다
  FREE_SELF_CARE_GAIN: 5, // 자가 충족 게이지 — 25분당, END_FOCUS 시간 정산 (행동과 같은 속도)
  PERSONAL_WORK_BASE: 0.2,
  PERSONAL_WORK_SCALE: 0.25, // + SCALE × (욕구 4종 평균/100) — 단, 4종 전부 충족 시에만 판정
  // 개정 v4-3: 판정은 세션당 1회(END_FOCUS), 확률은 시간 비례(×분/90 — 짧은 세션
  // 스팸 차단), 획득은 발동당 고정 — 시간당 기대값이 세션 길이와 무관해진다.
  // 시뮬 확정(v4): 균형 플레이 자아실현 100 ≈ 57h → 엔딩 ≈ 64h/15일차.
  SELF_ACT_GAIN_PER_WORK: 16, // 개인작업 자아실현 — 발동당 고정 (엔딩 속도의 축)
  API_TOKEN_PROB_BOOST: 0.15, // 개인작업 소모품(API 토큰) 소모 세션의 확률 가산
  MEMORY_WEIGHT_SELF_ACTION: 1, // 돌이 스스로 한 행동의 기억 약강화 (개정 v4-6)

  // 호감도 7티어 임계 (관계 대사 축) — 누적 호감도가 각 값 이상이면 그 티어.
  // M18 재조정: 래칫 바닥 0.5 도입으로 실효 시급이 ~22% 하락 — 표를 ×0.78로
  // 축소해 원 목표 복원 (균형 티어7 57.6h·엔딩 64.4h/15일, balance-sim 확정).
  AFFECTION_TIERS: [0, 6, 23, 43, 61, 78, 95],
  // 티어 '승급'은 하루 1회 (서사 비트 달력 게이트, 개정 v4-7) — 초과분은 이월.

  // 욕구 개편 (개정 v4-5)
  NEED_RISE_GATE: 80, // 욕구 n+1은 욕구 n이 이 값 이상일 때만 오른다 (위기 중 면제)
  // 욕구별 시간 비례 감소 (집중 h당, END_FOCUS 정산) — 아래 욕구일수록 빨리 고파진다
  NEED_DECAY_PER_HOUR: {
    physiological: 1.2,
    safety: 0.8,
    belonging: 0.6,
    esteem: 0.4,
  } as Record<string, number>,

  // 휴식 준수 배율 (개정 v4-4, 디메리트형 계단) — 다음 세션 게이지 정산에 곱한다. 정성 제외.
  REST_MULT_HALF: 0.75, // 배정 휴식의 절반 이상
  REST_MULT_SKIP: 0.5, // 절반 미만/스킵
  REST_MULT_HALF_RATIO: 0.5,

  // 엔딩
  SELF_ACT_COMPLETE: 100,

  // 동거 (의존도 하이브리드) — 호감도는 깎지 않는다
  DEPENDENCE_PER_SESSION: 4, // 동거 중 세션마다 상승
  COHABIT_ESTEEM_DECAY: 1, // 동거 세션마다 존중 게이지 하락
  COHABIT_SELF_ACT_DECAY: 1, // 동거 세션마다 자아실현 게이지 하락

  // 2차 독립기 (M14) — 묘목 성장 = 돌의 자아실현 재가동. 목표 25~30h (개정 v4 §5).
  // 시뮬 실측: 방문(성장 정지)이 세션의 ~40%를 차지. M20 재튜닝 2.7→2.8 —
  // M14b 붙잡기 사다리 이후 방문 체류가 늘어 27.5h/6일 목표에서 이탈한 것을 복원.
  SPROUT_GROWTH_PER_UNIT: 4.4,
  SPROUT_GROWTH_COHABIT_FACTOR: 0.5, // 동거는 균형 애착일 때만, 절반 속도 (잠식 역전)
  SPROUT_BLOOM_AT: 66, // 개화 임계 — 2차 게이트 재료
  /**
   * 단계 게이트 (피드백5) — 성장은 이 값에서 멈추고, 돌이 한 번 다녀가야 다음이 열린다.
   * "돌이 오지 않는 동안 나무가 되어버렸다"는 체감을 없앤다: 각 단계는 방문 1회를
   * 반드시 통과한다 (뿌리내림 → 개화 → 무반응 → 심기).
   */
  SPROUT_GATES: [50, 85, 100] as const,
  // 뿌리내림기 (M19b, v5 §6): 성장 절반부터 뿌리가 돌을 감싼다 — 불가역.
  // 시듦은 이때부터 소멸 (막을 수 없는 진행에 페널티는 무의미), 85부터는
  // 돌이 뒤덮여 더는 반응하지 않는다 (죽음의 암시 — 움직임의 소실)
  ROOTING_AT: 50,
  ROOTING_STILL_AT: 85,
  SPROUT_HINT_TIER: 6, // 1차 새싹 전조 — 이 티어부터 돌 정수리에 아주 작은 싹
  SPROUT_WITHER_HELD: 0.5, // 강제 체류(붙잡기 연장) 세션당 시듦
  SPROUT_WITHER_COHABIT: 0.25, // 동거 불안정 애착 세션당 시듦
  SPROUT_RECOVER: 0.25, // 자연/자발 세션당 회복
  DEPENDENCE_PER_HELD_SESSION: 2, // 강제 체류 = 임시 동거: 의존도 상승
  FAREWELL2_STREAK: 6, // 친밀위협 급성 연속 세션 임계 → 제2의 이별 (동거)
  // apart 제2의 이별: 붙잡기 대사 사다리(holdResult 변형 수)가 최대 누적 횟수 —
  // 사다리를 다 쓰고도 또 붙잡으면 돌이 스스로 떠나고, 한동안 방문이 끊긴다.
  VISIT_BLOCK_DAYS: 7,

  // 3차 — 나무 (M15): 달력 성장 단계 경계(일). 심음/활착/어린나무/자람/무성/성목.
  // 개화 100일(D-100 공명)·성목 365일은 개정 v4 §5 제안치.
  // M15b: 개화 상태로 심는다 — 2차에서 핀 꽃의 연속. 나이는 나무일(tree-days,
  // 경과일 + 동행 보너스)로 센다. 열매 3·각성기 7: 방치해도 일주일 안에 아이,
  // 열심히 오면 열매 다음 날 각성. 성목 180: 아이와 반년을 보낸 뒤가 완성.
  TREE_STAGE_DAYS: [0, 3, 7, 30, 90, 180] as readonly number[],
  // 동행 보너스 = 출석(하루 첫 세션 +1) + 세션 시간 비례(min(분,90)/90, 세션당
  // 최대 +1). 하루 합산 상한 2 — 심은 날 몰아쳐도 열매(3)는 다음 날이다
  TREE_BOND_ATTEND: 1,
  TREE_BOND_SESSION_MINS: 90, // 이 분수를 채우면 세션 보너스 +1
  TREE_BOND_DAILY_MAX: 2,

  // apart (빈자리) — 돌의 방문
  VISIT_PROB: 0.35, // 세션 시작 시 돌이 놀러올 확률 (피드백5: 게이트 대기를 줄이려 상향)
  VISIT_STAY_MIN: 1, // 머무는 세션 수
  VISIT_STAY_MAX: 3,
  VISIT_HOLD_EXTEND: 1, // 붙잡기로 연장되는 세션 수
} as const;
