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
  ATTACH_SOOTHE: 3, // 적정/거리 존중 접근 시 두 축 동시 진정량
  ATTACH_THREAT_UP: 5, // 과한 접근 시 친밀위협 상승량
  RETREAT_VOL_SCALE: 1.0, // 잠수 확률 = RETREAT_PROB × (1 + SCALE × 변동성/100)
  // 4분면 '상태 대사'는 급성일 때만 뜬다 (baseline 회피는 일반 풀 유지):
  ATTACH_CLINGY_ACUTE: 60, // 유기불안이 이 값 이상이면 집착 상태 대사
  ATTACH_AVOIDANT_ACUTE: 90, // 친밀위협이 이 값 이상이면 회피 상태 대사
  CONVERGE_STEP: 25, // 위기 루프(병간호/잠수) 매 턴 균형점으로 이동량 (상한 25%)
  // 약한 애착 표류 (개정 v4-8): 관계가 깊을수록 잃을까 불안해진다.
  // 세션마다 유기불안 += PER_TIER×티어 (+ 휴식 스킵 시 ON_SKIP).
  // 접근(세션 시작/선택지/대화)의 진정 −3이 이를 상쇄 — 성실 플레이어는 체감 0,
  // 무심·스킵 플레이어만 서서히 쌓여 유기적 위기(병간호)로 이어진다.
  // 시뮬 확정(v4): 1.0이면 성실 플레이어 0회, 무심·캐주얼 1~3회의 유기 위기.
  ATTACH_DRIFT_PER_TIER: 1.0,
  ATTACH_DRIFT_ON_SKIP: 3,
  ATTACH_RETURN_GAP: 20, // 위기 루프에서 |유기불안−친밀위협| 이 값 미만이면 복귀
  ABANDONMENT_SICK_CEILING: 85, // 유기불안이 이 값 초과면 돌이 아파짐 → 강제 병간호

  SECURITY_START: 25, // (파생 초기값 참고용 — 실제 값은 위 두 축에서 계산)
  RETREAT_GAP: 2, // 허용치 대비 이만큼 이상 초과하면 잠수 판정 (기획서 명시)
  RETREAT_PROB: 0.35,
  SECURITY_GAIN_MATCHED: 3,
  SECURITY_LOSS_BREACH: 5,

  // 잠수 (부재)
  ABSENCE_SESSIONS_MIN: 1, // 기획서 명시 1~3
  ABSENCE_SESSIONS_MAX: 3,
  RETURN_LOW_INTIMACY_MAX: 2, // 이 친밀도 이하 행동 세션만 복귀 누적에 카운트

  // 달력일 정산
  MOOD_DECAY_PER_DAY: 8,
  NEGLECT_DAYS_PER_REGRESS: 3, // 이 일수마다 욕구 1단계 퇴행 (하한 1, 죽지 않음)
  NEGLECT_ABANDONMENT_PER_STEP: 20, // 방치 퇴행 1스텝당 유기불안 상승 (오래 안 오면 불안해진다)

  // 상태값 공통
  STAT_MIN: 0,
  STAT_MAX: 100,
  MOOD_START: 50,

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
  // 개정 v4: 실측 래칫(안정감이 7~20h에 100 포화, 실효 ~0.9) 기반 재조정 —
  // 시간당 ~2.2~2.5 → 7티어(122) ≈ 53h, 엔딩 ≈ 55h+ (balance-sim 검증).
  AFFECTION_TIERS: [0, 8, 30, 55, 78, 100, 122],
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

  // apart (빈자리) — 돌의 방문
  VISIT_PROB: 0.25, // 세션 시작 시 돌이 놀러올 확률
  VISIT_STAY_MIN: 1, // 머무는 세션 수
  VISIT_STAY_MAX: 3,
  VISIT_HOLD_EXTEND: 1, // 붙잡기로 연장되는 세션 수
  HOLD_GUILT_MOOD: 5, // 붙잡기 죄책감 — 기분 하락량
} as const;
