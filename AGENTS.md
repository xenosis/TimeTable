## 프로젝트 개요
- 초등학교 2학년 딸을 위한 시간표 · 할 일 관리 앱
- 플랫폼: Android (React Native + Expo)
- 패키지: com.sewoong.kidtimetable
- 사용자: 딸(체크·보기), 아빠(관리자 — 원격 수정 + 딸 폰 PIN 수정)
- 자세한 조사 내용·설계: `docs/research.md` / 작업 목록: `docs/tasks.md`

## 기술 스택
- Framework: React Native (Expo SDK 57) / TypeScript
- 네비게이션: Expo Router (파일 기반 라우팅)
- DB: expo-sqlite (로컬) → 5단계 이후 Supabase PostgreSQL 연동 예정
- 알림: expo-notifications (일반) + 자체 Kotlin 모듈 (잠금 화면 알람)
- 상태관리: Zustand (예정)
- 빌드: `npx expo run:android` (개발 빌드) / EAS 또는 로컬 Gradle (릴리즈)

## 개발 환경
- Expo Go로 개발 불가 — 알람 모드(네이티브)와 위젯 때문에 항상 **개발 빌드** 사용
- Android SDK: `C:\Users\Lenovo\AppData\Local\Android\Sdk` (API 34~36 설치됨)
- 에뮬레이터: `Medium_Phone_API_36.0` (Android 16 / API 36)
- 기준 실기기: 갤럭시 A 시리즈 (딸 폰 입수 후 실기기 검증 필요)

## 버전 관리 정책
버그 수정·기능 변경 시 반드시 버전을 올릴 것. 항상 관련 파일 동시 수정:
`app.json` / `android/app/build.gradle`(있는 경우, versionCode +1, versionName) / `package.json`
- `patch` (1.0.x): 버그 수정 / `minor` (1.x.0): 새 기능 / `major` (x.0.0): 대규모 변경

## 라이브러리 정책
- 새 라이브러리 필요 시 사용자에게 먼저 물어볼 것
- Expo native 모듈은 반드시 `npx expo install` (npm install 금지)

## Doro(routine-planner) 프로젝트에서 얻은 교훈 (재사용)
같은 개발자가 만든 자매 프로젝트(`../routine-planner`, 앱 이름 Doro)에서 이미 겪은 문제들. 이 프로젝트에서도 같은 패턴을 쓰므로 반드시 참고할 것.

- **Paper/TextInput 한글 입력 규칙** (React Native Paper 등 controlled TextInput 사용 시)
  - **절대 금지**: `value={field || ' '}` — 한글 자모 분리 버그
  - **절대 금지**: `value={labelsReady ? field : ''}` (한글 입력 필드에) — `''` 폴백이 IME composition 파괴
  - **한글 입력 필드**(제목, 메모 등): 반드시 `value={field}` 직접 사용
  - **비한글 필드**(날짜·숫자 등)에서 label 딜레이 버그를 피하려면 `labelsReady` 패턴 사용 가능 (한글 필드에는 절대 금지)
- **Hermes 초기화 크래시**: `defaultOpen = false` 같은 구조분해 기본값 + `useState(defaultOpen)` 패턴 금지. 초기 상태는 항상 리터럴 `useState(false)` 사용
- **Android 알람 권한**: `SCHEDULE_EXACT_ALARM` + `USE_EXACT_ALARM` 권한 필요 (Android 12+/13+). 앱 시작 시 probe로 권한 박탈 감지 → 설정 화면 안내
- **반복 알람**: 다음 발생 1건만 예약 (OS 알람 슬롯 절약), 알람 탭/앱 시작 시 재등록
- **알림 채널**: Android 8+ 필수, 알림 권한 요청 전에 채널을 먼저 만들어야 함
- **위젯(RemoteViews)**: `<View>` 사용 불가 — `<TextView>`, `<ImageView>`, `<FrameLayout>` 등 허용 클래스만. 위젯은 `:widget` 별개 프로세스이므로 SharedPreferences 대신 파일로 데이터 공유
- **Gradle 증분 빌드(Windows)**: `.kt` 파일 내용이 같고 타임스탬프가 같으면 재컴파일 안 됨 → 빌드 전 타임스탬프 강제 갱신 필요
- **DB 초기화**: Promise 캐시로 동시 호출 race condition 방지 필수
- **Expo Push 토큰**: 릴리즈 APK(프로덕션 빌드)에서만 발급됨. 개발 빌드에서는 projectId 없어 에러
- **APK 대상 구분**: 
pm run build·
pm run check는 PC 에뮬레이터 검사용 x86_64 APK를 만든다. 딸 폰 등 실기기 설치에는 반드시 scripts/build-apk.ps1 -Target Device로 만든 Device-arm64-v8a APK만 사용하고, 파일명·ABI를 설치 전에 확인한다.

## 디자인 원칙
- 아이가 보는 화면: 큰 글씨, 큰 터치 영역, 과목별 색·아이콘 (`src/theme/index.ts` 참고)
- 편집·설정처럼 실수하면 안 되는 메뉴는 PIN 뒤에 숨김
- 완료 시 칭찬(스티커) 중심 문구, 못 한 일은 "아직 남았어요" 식으로 표현

## 현재 구현 상태 (2026-09-14)
- 0단계 조사 완료, 1단계(프로젝트 기반) 진행 중
- Expo Router 기반 프로젝트 생성, 홈 화면 placeholder만 존재
- 아직 시간표·알림·서버 연동 코드 없음

## Claude · Codex 공통 운영 규칙
- `CLAUDE.md`와 `AGENTS.md`는 어느 한쪽을 참조하는 구조가 아니다. 두 파일에 동일한 전체 규칙을 직접 기록하고 항상 같은 내용으로 유지한다.
- 공통 운영 규칙을 바꿀 때는 두 파일을 같은 작업에서 함께 수정한다. 한쪽만 달라진 상태에서는 개발을 시작하거나 작업 완료를 보고하지 않는다.
- Claude 전용 이벤트 등록은 `.claude/`, Codex 전용 이벤트 등록은 `.codex/`에 둔다. 실제 검사·백로그·대시보드 로직은 `scripts/`, `dashboard/`, `docs/`를 함께 사용한다.
- Claude와 Codex를 번갈아 사용할 때는 작업 시작 전 Git 상태와 백로그 입력 버전(SHA-256)을 다시 확인한다. 두 도구를 동시에 사용하지 않더라도 이전 세션의 상태를 추측하지 않는다.

## 개발 진행 상태
- 사용자가 2026-09-16에 기능 개발 홀드를 명시적으로 해제했다. 백로그의 deps·gate·완료 조건과 이 문서의 품질·라이브러리 정책을 지키며 실제 기능 개발을 진행한다.
- 개발 기반 작업과 기능 작업의 완료는 계속 구별한다. 단계 작업을 완료로 기록하려면 해당 `done_when`과 하위 작업·검증 조건을 모두 충족해야 한다.

## 표준 작업 실행 순서
1. `docs/research.md`, `docs/tasks.md`에서 기준 요구사항을 확인하고, 백로그는 `npm run backlog -- ...`로 조회한다. 시작 전에 `.claude/settings.json`, `.claude/rules/`, `.codex/config.toml`, `.codex/hooks.json`, `.codex/rules/`의 현재 적용 규칙도 확인한다.
2. `npm run backlog -- next --json`과 상세 조회로 `deps`, `gate`, `done_when`을 확인한 뒤 수행 가능한 작은 작업을 고른다. `gate` 문자열은 실행하지 않으며 사람의 판단이 필요하면 질문을 남기고 `needs_info`로 관리한다.
3. 실제로 착수할 때만 최신 SHA-256을 `--expect-hash`에 넣어 `set-status <ID> in_progress --owner <담당> --note <착수 근거>`를 실행한다. CLI가 기록하는 `claimed_at`, `updated_at`, `log`가 실제 담당과 시각을 반영하도록 하며 상태가 바뀔 때마다 즉시 기록한다.
4. 코드 책임 경계와 파일 길이 기준을 지켜 구현한다. 편집 후 hook의 빠른 검사를 처리하고 완료 전 `npm run check` 전체 검사를 통과시킨다.
5. 구현과 검사를 마친 동일 입력의 SHA-256을 고정하고, 등록된 `critical-reviewer`와 `backlog-explainer`를 병렬 실행한다. Codex에서는 `npm run backlog-review -- --task <ID> --expect-hash <SHA-256>` dispatcher를 사용한다. 실행 중 기준 요구사항·백로그를 바꾸지 않고 JSON 변경은 메인 에이전트만 수행한다.
6. 두 subagent 결과를 합쳐 확인된 근거가 있는 지적만 반영하고, 영향받은 코드·문서와 전체 검사를 다시 확인한다. 추측이나 사람의 결정이 필요한 항목은 질문 또는 `needs_info`로 남긴다.
7. 리뷰가 실행되었고 `done_when`, deps·하위 작업, 검사 결과, 검토 반영이 모두 확인된 경우에만 `in_review`에서 `done`으로 변경하며 `--evidence`와 `--verification`을 기록한다. 리뷰 미실행, 검사 실패, `NOT_CONFIGURED`, `TIMEOUT_UNVERIFIED`는 완료 근거가 아니다.
8. JSON 변경 뒤 새 SHA-256으로 관련 `docs/backlog/**` 문서를 갱신하고 `npm run dashboard`에서 최신 파일명·갱신 정보·상태·참조 오류를 확인한다.
9. `todo`, `in_progress`, `in_review`, `needs_info`, `blocked`, `done`, `cancelled` 중 실제 상태가 달라질 때마다 백로그 CLI로 해당 작업을 즉시 갱신한다. 중단·재시작 시 `status`, `owner`, `claimed_at`, `updated_at`, `log`만으로 이어갈 수 있을 만큼 구체적인 `--note`를 남긴다.

## 연속 실행 규칙
- 사용자가 작업 진행을 요청한 뒤에는 한 작업의 구현·검사·리뷰·상태 기록이 끝났다는 이유만으로 응답을 종료하거나 사용자 판단을 기다리지 않는다. 같은 작업 흐름 안에서 `npm run backlog -- next --json`으로 다음 실행 가능 항목을 조회하고 즉시 착수한다.
- `final` 응답은 다음 항목이 없거나, 모든 실행 가능 항목이 `needs_info`·`blocked`·실기기 확인·명시적 사용자 승인처럼 사용자 판단을 필요로 하는 상태일 때만 사용한다. 중간 결과는 `commentary`로만 짧게 알린다.
- 리뷰 보완·검증 실패가 있으면 해당 작업을 계속 보완하고 재검증·재리뷰한다. 완료된 항목의 보고 자체는 다음 작업을 멈추는 이유가 아니다.
- 이 규칙은 자동 스케줄러나 hook이 메인 에이전트를 새로 실행한다는 뜻이 아니다. 현재 메인 에이전트가 작업 흐름을 끊지 않고 다음 CLI 호출을 수행해야 하는 운영 규칙이다.

## 백로그 운영
- 세션을 시작하면 프로젝트 루트의 `backlog.json` 존재 여부와 `scripts/backlog/cli.cjs` 실제 존재 여부를 먼저 확인한다. 도구가 없으면 직접 읽기로 우회하지 말고 사용자에게 복구 방법을 보고한다.
- 기준 백로그는 직접 읽거나 일반 검색으로 훑지 않는다. 검증된 CLI인 `npm run backlog -- ...`를 사용한다.
- 진행 상황: `npm run backlog -- list --status in_progress --json`
- 누락 없는 전체 순회: `npm run backlog -- list --all --json`
- 상세 조회: `npm run backlog -- get <ID> --json`
- 의존성을 고려한 후보 조회: `npm run backlog -- next --json`
- 조회 명령은 읽기 전용이며 상태를 자동으로 바꾸지 않는다. `gate` 등 데이터 문자열은 표시만 하고 명령이나 코드로 실행하지 않는다.
- 변경은 CLI의 명시적인 `add`, `set-status` 명령만 사용한다. 변경 전 현재 SHA-256을 조회하고 `--expect-hash`로 전달하여 동시 변경 충돌을 막는다.
- 완료 상태로 바꾸기 전에는 `done_when`, 부모·의존 작업, 프로젝트 검증 결과와 완료 근거를 확인한다. 문서화 완료와 해당 개발 작업 완료를 구별한다.
- 백로그 변경에 실패하면 원본이 보존됐는지 확인하고, 직접 편집으로 우회하지 않는다.

## 품질 검증
- Codex Stop hook은 해당 대화 세션에서 관리 대상 소스코드를 추가·수정·삭제한 표시가 있을 때만 전체 검사를 실행한다. 읽기 전용 대화와 설정·문서만 수정한 대화는 건너뛰며, 검사 통과 후 표시를 지우고 실패 시 재검사를 위해 유지한다.
- 빠른 편집 검사는 코드 길이와 lint를 확인한다. 기본 소스 파일 기준은 300줄이며, 생성물·의존성·데이터 파일은 제외한다. 초과 시 코드를 압축하거나 의미 없이 나누지 말고 책임 경계를 기준으로 분리한다.
- 소스코드 변경 작업 완료 전 `npm run check`를 실행하여 지침 동기화, 코드 길이, lint, typecheck, Jest, Android debug build를 모두 확인한다. 설정·문서만 변경한 작업은 해당 파일의 문법·일관성 검사만 수행한다.
- 검사 도구가 없거나 시간 초과가 발생하면 `NOT_CONFIGURED` 또는 `TIMEOUT_UNVERIFIED`로 취급한다. 통과나 완료 근거로 사용하지 않는다.
- Stop hook 재진입 시 무한 반복은 막되, 남아 있는 실패를 완료로 보고하지 않는다.
- 배포는 별도 요청이 없는 한 수행하지 않는다.

## Subagent 운영
- Claude 등록 파일은 `.claude/agents/critical-reviewer.md`, `.claude/agents/backlog-explainer.md`이고 Codex 등록 파일은 `.codex/agents/critical-reviewer.toml`, `.codex/agents/backlog-explainer.toml`이다. 반드시 등록 이름 `critical-reviewer`, `backlog-explainer`로 호출한다.
- `critical-reviewer`는 읽기 전용으로 요구사항 누락, 모호한 완료 조건, 잘못된 deps/parent, 미해결 gate, 과도한 작업 크기와 구현 불일치를 비판적으로 검토한다. `backlog-explainer`는 `docs/backlog/**` 문서만 갱신한다.
- 메인은 CLI 조회 결과의 schema version·SHA-256과 관련 요구사항·코드 정보를 두 subagent에 동일하게 전달하고 병렬로 시작한다. 실행 중에는 그 기준 입력을 변경하지 않는다.
- 두 subagent 모두 백로그 변경 명령을 사용하지 않는다. `add`와 `set-status`는 메인 에이전트만 수행한다.
- subagent 결과의 추측과 확인된 사실을 구분하며, 요구사항에 없는 내용은 만들어 넣지 않고 확인 질문으로 남긴다.
