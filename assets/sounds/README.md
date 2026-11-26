# 보면 플레이어 타격음

웹 플레이어(`/chart`)·디스코드 Activity(`/activity`)·풀영상(MP4)이 같이 쓰는 타격음이다(`src/web/chartSound.ts`).

| 파일 | 쓰는 곳 | 출처 | 라이선스 |
|---|---|---|---|
| `hit.wav` | TOUCH 를 뺀 모든 노트(TAP·HOLD·SLIDE·BREAK·EX) | Kenney "UI Audio" 의 `rollover2.wav` (kenney.nl, GitHub 사본 Calinou/kenney-ui-audio) | CC0 1.0 (퍼블릭 도메인) |

TOUCH 는 파일 없이 합성한다(`carolSynth('clap', 'tap')`).
게임(SEGA) 효과음은 저작권 때문에 쓰지 않는다. 바꿀 때는 CC0 이거나 이용 허락을 받은 파일만 넣는다.
