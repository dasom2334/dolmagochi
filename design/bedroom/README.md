# 침실(작업방) 씬 — 프로토타입

미리보기: `http://localhost:5180/dolmagochi/design/bedroom/preview.html`
(아트 서버 `art-preview` / 포트 5180)

## 무엇인가

거실(`design/livingroom`)에 이은 **두 번째 방**. 거실 v3처럼 시간·계절·날씨·돌·소품을
전부 토글하는 인스펙터가 붙어 있다. 아직 **앱 이식 전**(거실의 livingroom-port 같은
작업이 따로 필요) — 여기서 아트를 확정한 뒤 옮긴다.

## 아키텍처 — 거실 모듈 재사용

새 방을 위해 처음부터 만들지 않는다. 순수·공유 자산은 거실에서 그대로 import:

| 재사용 (거실 모듈) | 용도 |
|---|---|
| `livingroom/scene/palette.js` `resolve()` | 시간·계절·날씨 색 해결 |
| `livingroom/scene/generate.js` `generateGroups({})` | 창밖 하늘·산·구름·달·바닥(절차) |
| `livingroom/scene/lights.js` `OVERLAYS`·`AMBIENT` | 방 색감 오버레이(zone 태그 재활용) |
| `livingroom/scene/lights.js` `VIGNETTE` | 가장자리 비네트 |

침실 고유(새로 그림):

| 파일 | 내용 |
|---|---|
| `geom.js` | 가구 지오메트리(무광원 중립 rect) + 돌 3자리 + 스탠드 발광 |
| `preview.html` | 방-종속 렌더러(벽·왼쪽 창·창빛 웅덩이) + 인스펙터 |

**거실과 결정적으로 다른 점**: 창이 **왼쪽**(x16~49)이다. 거실은 가운데였고,
`lights.js` 의 창광·오버레이 zone 이 그 전제로 잘려 있어 **창은 재사용 불가**였다.
그래서 창빛 웅덩이(`drawWindowPool`)와 방 영역 클립(`clipRoom`, evenodd)을 새로 잡았다.

## 돌 3자리 (기획 확정 2026-07-21)

| 상황 | 자리 | 좌표(orbBall) |
|---|---|---|
| 개인작업 집중 | 책상 **의자** | cx26 y41 |
| 누워있기 — 침대 구매함 | **침대** | cx99 y36 |
| 누워있기 — 침대 없음 | **러그** | cx65 y61 |

인스펙터의 `돌` 행에서 none/chair/bed/rug 전환. 앱 이식 때 `fromGame` 이 게임 상태로
이 자리를 고른다(거실의 sill/rug 두 자리 → 침실은 세 자리).

## 렌더 순서

```
하늘(창 개구부 클립) → 벽 → 창틀 → 바닥 → 가구(z순서) → 돌
→ 시간·날씨 오버레이(방 영역) → 창빛 웅덩이 → 스탠드 발광 → 비네트
```

## 남은 다듬기 (최종 검수 대상)

첫 패스라 형태가 거칠다. 검수 후 다듬을 것:

- [ ] **가구 디테일** — 침대·의자·선풍기가 블록에 가깝다. 명암·모서리 보강
- [ ] **돌 스프라이트** — 조금 크고 옅다. 자리별 크기·셰이딩 조정
- [ ] **벽 무늬** — 마름모가 균일하다. 손질하거나 톤 변주
- [ ] **창밖 천체 위치** — 달·해가 거실 창 자리(x56)라 침실 창(x16~49)에서 치우친다.
      침실 창에 맞춰 이동
- [ ] **스탠드 발광 셰이프** — 지금은 사각 근사. 창빛처럼 부드럽게
- [ ] **앱 이식** — livingroom-port 같은 별도 작업(fromGame 침실 번역, 소품 게이팅,
      돌 자리 판정, 침실 렌더 컴포넌트)

## 소품 → 게임 아이템 (이식 때 게이팅 기준)

| 씬 소품 | 게임 아이템 |
|---|---|
| bd-bed | pillow → bed |
| bd-desk / bd-laptop | desk → stationery → laptop |
| bd-lamp (+glow) | lamp (스탠드) |
| bd-fan | fan |
| bd-nightdrink | nightdrink(야식) 재고 |
| bd-deskplant / bd-shelf / bd-frames / bd-nightstand | 방 기본(비상점) — 항상 |
