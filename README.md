# 돌 다마고치 뽀모도로

집중용 Flowtime 타이머 + 돌 육성 웹게임. 서버 없는 리액트 SPA.
내가 쓰려고 만듬.

## 기술 스택

- React + Vite + TypeScript
- 상태: zustand (게임 상태 + 순수 상태머신)
- 저장: IndexedDB (`idb`), 앱 시작 시 `navigator.storage.persist()`
- 오디오: Web Audio API (효과음·화이트노이즈 즉석 합성, 오디오 파일 없음)
- 알림: Notification API + Web Worker (백그라운드 휴식 타이머)
- 테스트: Vitest (순수 로직 전량)

## 실행

```bash
npm install
npm run dev        # 개발 서버
npm test           # 유닛 테스트
npm run validate   # 게임 데이터 검증
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드본 미리보기
```

## 배포

`main`에 push하면 GitHub Actions가 테스트·검증·빌드 후 GitHub Pages로 배포한다
(`.github/workflows/deploy.yml`). 프로젝트 페이지이므로 `vite.config.ts`의
`base`는 `/dolmagochi/`.

## 라이선스

- 코드: 개인 프로젝트
- 폰트: [Galmuri11](https://github.com/quiple/galmuri) — SIL Open Font License 1.1
  (고지문: [`public/fonts/OFL.txt`](public/fonts/OFL.txt))
