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
  CHOICE_RECALL_SEC: 120,

  // 집중 구간 알림 문턱 (휴식 티어 경계 25/50/90분과 동일). key = 설정 토글 키.
  // 포그라운드=토스트 / 백그라운드=OS 알림. 문구는 카탈로그(SYS.notification.focus).
  NOTIFY_FOCUS_MARKS: [
    { sec: 1500, key: 'focus25' },
    { sec: 3000, key: 'focus50' },
    { sec: 5400, key: 'focus90' },
  ] as const,

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

  // 안정감 (숨은 값, 0–100)
  SECURITY_START: 25,
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

  // 상태값 공통
  STAT_MIN: 0,
  STAT_MAX: 100,
  MOOD_START: 50,

  // 욕구 게이지 (명명 분리 — 단계는 파생값)
  NEED_FILLED_THRESHOLD: 60, // 이 값 이상이면 해당 욕구 '충족' — 단계 파생 기준
  NEED_REGRESS_AMOUNT: 30, // 방치 퇴행 1스텝당 최상위 충족 욕구 하락량

  // 자유행동 (순차 자가 충족 · 개인작업)
  FREE_SELF_CARE_PROB: 0.5, // 첫 미충족 욕구를 스스로 채우는 행동 확률
  FREE_SELF_CARE_GAIN: 5, // 자가 충족 1회당 게이지 상승
  PERSONAL_WORK_BASE: 0.05,
  PERSONAL_WORK_SCALE: 0.25, // + SCALE × (욕구 4종 평균/100) — 단, 4종 전부 충족 시에만 판정
  SELF_ACT_GAIN_PER_WORK: 10, // 개인작업 1회당 자아실현 게이지 상승

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
