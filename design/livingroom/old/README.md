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
