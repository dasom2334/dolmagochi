# old/ — 폐기된 시안·파이프라인

여기 있는 것은 **전부 대체됐다. 참고만 하고 되살리지 말 것.**

| 파일 | 정체 | 대체한 것 |
|---|---|---|
| `index.html` | v1 — 레퍼런스 충실 재현. 라이팅이 구워진 상태 + 팔레트 스왑 테마 | `../v2.html` |
| `layers.html` | 29에셋 레이어 조합 실험 (전역 색 오버레이 스태킹) | `../v2.html`의 3계층 합성 |
| `assemble.py`, `template.html` | v1 조립 파이프라인 | `../tools/assemble_v2.py` + `template_v2.html` |
| `template_layers.html` | layers 실험용 템플릿 | 〃 |

## 왜 버렸나

- **v1**: 조명이 그림에 구워져 있어 시간대를 바꾸면 광원 방향이 어긋난다.
  낮 팔레트도 물빠진 라벤더라 불호. → 중립 알베도 + 오버레이 합성(v2)으로 전환.
- **layers**: 색 오버레이를 화면 전체에 깔아 블렌딩하는 방식이라
  "창문 밑 러그에 쏟아진 빛" 같은 개별 광원을 표현할 수 없었다.
  → 광원별 셰이프 SVG + Light Mask(v2)로 전환.

## 아직 tools/에 남아 있는 레거시

`tools/assemble_layers.py` — layers 실험 산물이지만 **v2가 아직 의존한다.**
파티클·창문효과·달·별·구름 오버레이 문자열을 여기서 뽑아 쓴다:

```python
la = open('assemble_layers.py').read()
overlay = la.split("overlay = '''")[1].split("'''")[0]
```

JS 리팩토링 때 이 블록을 옮기면 이 파일도 old/로 내릴 수 있다.

---

## migration/ — 1회성 마이그레이션 스크립트 (2026-07-20)

v2(구운 SVG) → v3(런타임 canvas) 로 옮길 때 한 번만 쓴 것들. 다시 돌릴 일 없다.

| 파일 | 한 일 |
|---|---|
| `export_palette.py` | template_v2.html 의 CSS 변수 → `scene/palette.js`. 컴파운드 예외 7개 포함 |
| `export_props.py` | 오버레이 SVG 블록 → `scene/props.js`. 애니메이션 하위 레이어를 부모별로 분리 |
| `verify_port.mjs` | gen.py 절차 생성부를 JS로 옮긴 결과를 **rect 단위로 대조**. 1151개 전부 일치 확인 후 역할 종료 |

`verify_port.mjs` 는 브라우저 프리뷰가 죽어 화면을 볼 수 없던 시기에,
포팅이 맞는지 수치로 증명하려고 만든 안전망이었다.
이제 `scene/generate.js` 가 원본이므로 정답지(gen.py 절차 생성부)가 없어 돌릴 수 없다.

## v2.html — 구운 SVG 시대의 확정본

179KB. 지오메트리 2700개가 HTML에 박혀 있고, 색은 CSS 변수, 상태 조합은
`#t-sunset:checked ~ #s-winter:checked ~ .scene` 같은 셀렉터 특이도로 결정됐다.
v3 는 같은 그림을 4.8KB 로 만든다 — 그림을 브라우저가 계산하기 때문.
**v2.html 은 파일만으로 열린다**(재생성 파이프라인 불필요) — 눈대중 비교용으로 남긴다.
