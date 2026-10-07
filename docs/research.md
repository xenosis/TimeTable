# TimeTable 조사 결과

> 작성일: 2026-09-14
> 대상: 초등학교 2학년 딸을 위한 시간표 · 할 일 앱

---

## 1. 요구사항

### 사용자

| 사용자 | 기기 | 하는 일 |
|--------|------|---------|
| 딸 (초2) | 일반 안드로이드폰 + 구글 패밀리링크 | 시간표 보기, 할 일 체크, 알림 받기 |
| 아빠 (관리자) | 안드로이드폰 | 시간표·할 일 편집, 완료 현황 확인 |

### 기능

| # | 기능 | 결정된 내용 |
|---|------|-------------|
| F1 | 수정 가능한 시간표 | 요일별 주간 시간표 (최우선) |
| F2 | 매일 할 일 | 체크 + 칭찬 스티커, 아빠가 완료 현황 확인 |
| F3 | 시간 알림 | 항목별 선택: **일반 알림** / **알람** (전체화면 + 끌 때까지 울림) |
| F4 | 관리자 권한 | **아빠 폰에서 원격 수정** + **딸 폰에서 PIN 입력 후 수정** |

---

## 2. 결론 요약 (추천 방향)

1. **Doro(routine-planner)와 같은 기술로 만든다.** Expo + TypeScript + Supabase 경험과 코드를 그대로 쓸 수 있다.
2. **앱은 하나만 만든다.** 로그인한 계정의 역할(아빠/딸)에 따라 화면이 달라진다.
3. **알림은 딸 폰 안에 예약한다.** 인터넷이 끊겨도 울려야 하므로 서버는 데이터 동기화에만 쓴다.
4. **APK를 직접 설치한다.** 패밀리링크에서 설치를 허용하면 되고, 플레이스토어 정책 심사를 피할 수 있다.
5. **가장 불확실한 두 가지를 먼저 실기기에서 검증한다.** 하나는 딸 폰에 APK가 설치되는지, 다른 하나는 알람 모드(전체화면)가 동작하는지다.
6. **로컬 우선으로 개발한다.** 딸 폰 단독으로 쓰는 버전을 먼저 완성해 실사용을 시작하고, 서버 연동(원격 수정)은 그 다음에 붙인다.

---

## 3. 기술 스택

| 분류 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | React Native + **Expo SDK 57** | 2026-06-30 출시된 최신 안정 버전. Doro는 SDK 54 |
| 언어 | TypeScript | |
| 로컬 DB | expo-sqlite | 딸 폰의 오프라인 캐시 (Doro 경험) |
| 서버 | Supabase (Postgres + RLS + Realtime + Edge Functions) | Doro 경험 |
| 일반 알림 | expo-notifications | Doro에서 검증됨 |
| 알람 모드 | 자체 Kotlin 모듈 | 잠금 화면 알람은 0단계 PoC에서 결정 |
| 원격 푸시 | Expo Push API + FCM | Doro `notify-schedule` 방식 재사용 |
| 상태관리 | Zustand | Doro 경험 |
| 네비게이션 | **결정 필요** | 아래 참고 |
| 테스트 | Jest (jest-expo) | 시간 계산 · 알림 예약 계산은 순수 함수로 만들어 테스트 |

### 참고 사항

- **Expo Go로는 개발할 수 없다.** 알람 모드(네이티브 코드)와 원격 푸시를 쓰려면 개발 빌드(`npx expo run:android`)가 필요하다. 이 PC에는 Android SDK(API 34~36)와 Android Studio가 이미 설치되어 있다.
- **SDK 56에서 알려진 문제:** reanimated/worklets를 쓰면 Hermes 메모리 문제가 생길 수 있었다. SDK 57에서 해결되었으므로 SDK 57로 시작한다.
- **네비게이션 선택:** SDK 56부터 Expo Router가 React Navigation 의존을 제거했다.
  - Expo Router: 새 템플릿의 기본값
  - React Navigation: Doro에서 익숙한 방식
  - 둘 다 가능하므로 프로젝트 생성 시 결정한다.
- **UI 라이브러리:** Doro의 React Native Paper v5가 SDK 57과 호환되는지 설치 시 확인한다. 아이용 화면은 큰 버튼·카드를 직접 만드는 비중이 클 것이다.

---

## 4. 설치 · 배포 (패밀리링크)

### 방법 1 (추천): APK 직접 설치

1. 아빠 폰의 패밀리링크 앱을 연다.
2. 자녀를 선택하고 기기 설정에서 **"출처를 알 수 없는 앱"**을 켠다. 웹(g.co/yourfamily)에서도 설정할 수 있다.
3. 딸 폰에 APK를 설치한다. (USB `adb install` 또는 파일 전송)

**장점**
- 플레이스토어 정책(정확한 알람, 전체화면 알림, 가족 정책) 심사를 받지 않는다.
- Doro와 같은 빌드 절차를 쓸 수 있다.

**주의**
- 업데이트할 때는 반드시 **같은 서명 키**로 빌드해야 한다. 키를 잃어버리면 앱을 지우고 다시 설치해야 한다.
- 설정을 켰는데도 설치가 막혔다는 사례가 있다(Android 14, Pixel). 그래서 **0단계에서 실제 딸 폰으로 먼저 확인**한다.

### 방법 2 (대안): 플레이스토어 내부 테스트

- Play Console 개발자 계정(등록비 25달러)을 만들고 내부 테스트 트랙으로 배포한다.
- 패밀리링크 자녀 계정이 내부 테스트 앱을 설치할 수 있는지는 **확인하지 못했다**. 방법 1이 실패할 때만 검토한다.
- Play로 배포하면 `USE_EXACT_ALARM` 선언 심사, 전체화면 알림 권한 회수, 가족 정책 준수가 필요해진다.

---

## 5. 알림 · 알람 (가장 큰 기술 위험)

### 5-1. 안드로이드 권한

| 권한 | 용도 | 동작 방식 | 우리 앱 대응 |
|------|------|-----------|--------------|
| `POST_NOTIFICATIONS` (13+) | 알림 표시 | 실행 중 사용자에게 요청한다. 알림 채널을 1개 이상 만든 뒤에야 요청 창이 뜬다 | 첫 실행 안내 화면에서 요청 |
| `SCHEDULE_EXACT_ALARM` (12+) | 정확한 시각에 알림 | Android 14+에서 새로 설치하면 기본 거부. 사용자가 설정에서 허용해야 한다 | 보조 수단 |
| `USE_EXACT_ALARM` (13+) | 정확한 시각에 알림 | 설치 시 자동 허용. Play에서는 알람·캘린더가 핵심인 앱만 허용 | **선언** (APK 배포라 가능, Doro와 동일) |
| `USE_FULL_SCREEN_INTENT` (14+ 특별 권한) | 잠금화면 위에 전체화면 알람 | 기기·설치 경로에 따라 별도 허용이 필요하다. SM-A245N(Android 16) 개발 APK의 최초 확인에서는 거부 상태였다 | 첫 실행에서 상태를 확인하고, 꺼져 있으면 설정 화면으로 안내 |
| 배터리 최적화 예외 | 절전 중 알림 지연 방지 | 제조사(삼성 등) 절전 기능이 앱의 백그라운드 동작을 제한할 수 있다 | 첫 실행 안내 화면에서 예외 설정 안내 |

### 5-2. 일반 알림과 알람 모드 구현 방식

**일반 알림**은 expo-notifications 로컬 알림으로 만든다. Doro에서 정확한 알람 권한 확인과 채널 설정까지 검증되어 있다.

**알람 모드**(전체화면 + 끌 때까지 소리 + "끄기" 버튼)는 expo-notifications만으로는 부족하다. 포그라운드 서비스를 지원하지 않고 전체화면 알림에도 제약이 있다. 선택지는 세 가지다.

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. react-native-notify-kit** | Notifee와 호환되는 포크. 전체화면 알림, 포그라운드 서비스, AlarmManager 트리거를 지원하고 Expo 개발 빌드를 지원한다 | 커뮤니티(개인)가 유지보수해서 지속성이 위험하다. 원본 Notifee는 2026-04에 아카이브되었다 |
| **B. 직접 만든 Expo 모듈 (Kotlin)** | `AlarmManager.setAlarmClock()`, 전체화면 액티비티, 알람음을 직접 제어한다. 외부 의존이 없다 | 작업량이 가장 크다. Doro 위젯에서 Kotlin 네이티브 모듈을 만든 경험은 있다 |
| **C. expo-notifications + 알람용 채널** | 가장 단순하다 (큰 소리·진동 채널) | 전체화면과 계속 울림이 안 되므로 "알람처럼"은 불가능하다 |

**추천 순서**
1. C로 일반 알림을 먼저 완성한다.
2. 동시에 A를 PoC(개념 검증)한다.
3. 딸 폰에서 잠금화면, 무음 모드, 앱 종료, 화면 꺼짐 상태를 테스트한다. 통과하면 A를 채택하고, 실패하면 B로 간다.
4. A를 채택하면 일반 알림도 A로 통일할지 검토한다. 라이브러리가 두 개면 예약과 취소 로직이 복잡해진다.

**D3 결정 (2026-09-19): B. 직접 만든 Kotlin 모듈을 사용한다.**

- `react-native-notify-kit` 10.7.1 PoC는 전체 화면 알림 특별 접근의 기본 상태와 임시 허용 상태 모두에서 전용 전체 화면 대신 NotificationShade/AOD만 표시됐다. 반복음과 `끄기` 동작은 이 경로에서 확인하지 못했다.
- 최종 경로는 `AlarmManager.setAlarmClock()`의 broadcast → `CATEGORY_ALARM`·높은 중요도 전체 화면 알림 → 잠금을 유지하는 `AlarmActivity`다. 전용 화면은 반복음을 재생하고 `끄기` 또는 화면 종료 시 해당 진행 중 알림까지 없앤다.
- SM-A245N(Android 16)에서 전체 화면 알림 특별 접근이 거부된 상태에서는 상단 알림과 진동만 나타났다. 허용한 뒤 잠금 상태에서 전용 화면, 반복음, 끄기 동작을 확인했다.

### 5-3. 예약 전략: "롤링 예약"

앞으로 **7일 동안** 울려야 할 알림을 전부 계산한다. 앱이 예약해 둔 알림을 모두 취소한 뒤 날짜를 지정해 다시 예약한다.

**이 방식을 쓰는 이유**
- 공휴일·방학 예외와 원격 수정 반영이 쉽다. 매번 처음부터 다시 계산하면 되기 때문이다.
- "매주 반복" 트리거는 특정 날짜만 빼는 예외 처리가 어렵다.

**예약 개수 제한**
- 안드로이드는 앱 하나당 예약 알람을 약 500개로 제한한다.
- 7일치는 충분하다. 예: 하루 10개 × 미리알림 포함 2배 × 7일 = 140개

**다시 계산하는 시점**
- 앱 실행
- 데이터 변경
- 앱이 백그라운드에서 돌아올 때
- 백그라운드 주기 작업(expo-background-task)
- 재부팅 후 (동작 확인 필요)

**주의**
- 사용자가 설정에서 앱을 **"강제 중지"**하면, 앱을 다시 열 때까지 알림이 오지 않는다. 안드로이드 자체의 제한이다.
- 패밀리링크의 **사용 시간 제한·잠자리 시간** 중에 알림이 어떻게 동작하는지는 확인되지 않았다. 실기기 테스트 항목이다.

---

## 6. 원격 수정 반영 (아빠 폰 → 딸 폰)

알림은 딸 폰에 예약되어 있다. 따라서 아빠가 시간표를 고치면 **딸 폰이 새 데이터를 받아 알림을 다시 예약해야** 한다.

```
아빠 폰: 시간표 수정
  → Supabase DB 저장
  → Edge Function → Expo Push → 딸 폰에 "시간표가 바뀌었어요" 알림

딸 폰: 아래 중 하나라도 일어나면 동기화
  - 앱 실행 / 앱으로 돌아옴
  - Realtime 구독 (앱이 켜져 있을 때)
  - 푸시 알림 탭
  - 백그라운드 주기 작업
  → 로컬 SQLite 갱신 → 알림 롤링 재예약
  → "마지막 동기화 시각"을 서버에 기록

아빠 폰: "딸 폰 마지막 동기화 오후 3:12"와 이 폰의 마지막 저장 시각 표시
  → 시각만으로 딸 폰의 알람·위젯 적용 성공을 단정하지 않는다(P6.8 보완)
```

- **데이터 전용 푸시만으로는 부족하다.** 백그라운드 데이터 푸시로 조용히 동기화하는 방법이 있지만, 앱이 종료된 상태에서는 작업이 실행되지 않는다는 이슈가 보고되었다(expo/expo #38223, #29622). 그래서 위처럼 여러 경로로 보완한다.
- **확실한 반영 방법:** 딸 폰에 **보이는 푸시**를 보내고, 딸이 한 번 탭하게 한다.
- **아빠의 확인 방법:** 딸 폰의 마지막 동기화 시각을 보고 반영 여부를 판단한다.

---

## 7. 관리자 권한 설계

### 계정

- Supabase Auth로 **아빠 계정(parent)**과 **딸 기기용 계정(child)** 2개를 만든다. `family_members` 테이블로 한 가족으로 묶는다.
- 딸 폰은 아빠가 설치할 때 로그인해 둔다. 로그아웃과 설정 메뉴는 PIN 뒤에 숨긴다.
- 나중에 개선할 점: 딸 기기용 이메일 대신 "연결 코드"로 기기를 등록하는 방식 (선택)

### DB 권한 (RLS)

| 데이터 | 아빠 (parent) | 딸 (child) |
|--------|---------------|------------|
| 시간표, 교시 시간, 할 일 목록, 휴일·방학 | 읽기 / 쓰기 | 읽기 / 쓰기 (D7: PIN은 딸 폰 로컬 잠금) |
| 할 일 완료 기록, 보석 지급 | 읽기 / 쓰기 | 읽기 / 쓰기 (앱이 직접 기록, 오프라인 체크가 나중에 올라오므로 날짜 제한 없음) |
| 보상 목표 | 읽기 / 쓰기 | 읽기 / 쓰기 (딸 폰 관리자 모드에서 편집) |
| 기기 동기화 상태 | 가족 기기 읽기·삭제, 자기 것 쓰기 | 자기 것 읽기·쓰기 |

### 딸 폰의 PIN 관리자 모드

- **결정(2026-10-01, D7): PIN은 딸 폰에서 로컬로 확인한다.** 딸 계정에 시간표·할 일 수정 권한을 주고 PIN은 화면 잠금으로만 쓴다(PIN 권한 확인은 중요도가 낮다는 사용자 판단). 그래서 서버 PIN 확인(Postgres RPC)과 `families.parent_pin_hash`는 만들지 않는다. 대신 딸 기기의 로그인 토큰만 있으면 서버 데이터를 고칠 수 있다는 점을 받아들인다.
- (이전 설계, 폐기) 딸 계정은 DB상 수정 권한이 없고 PIN을 서버 함수(Postgres RPC)에서 확인한 뒤 수정을 처리한다. PIN은 해시로만 저장한다(pgcrypto).
- 연속으로 틀리면 잠시 잠근다(로컬 `src/security/pin.ts`, 5회 실패 시 5분 잠금 후 자동 해제). 관리자 편집은 시간이 지나도 자동으로 잠기지 않고, 앱이 백그라운드로 가면 다시 PIN을 요구한다(2026-10-01 사용자 결정: 5분 자동 잠금 제거).
- (D7로 폐기) 서버 확인 방식이었다면 딸 폰에서 PIN으로 수정할 때 인터넷 연결이 필요했다. D7 결정으로 PIN은 로컬 확인이라 오프라인에서도 수정할 수 있다.
- PIN 해시는 기기 보안 저장소(expo-secure-store)에 둔다(서버 연동 뒤에도 같음, D7).
- (D7로 채택) 딸 계정에 수정 권한을 주고 PIN은 화면 잠금으로만 쓴다. 2026-10-05에 보상 목표·보석 장부·교시·휴일 쓰기와 지난 날짜 체크까지 딸 계정에 허용했다(D4·P6.3).

---

## 8. 데이터 모델 초안

| 테이블 | 주요 컬럼 | 설명 |
|--------|-----------|------|
| `families` | id, name (parent_pin_hash는 D7로 만들지 않음) | 가족 단위. 실제 서버 테이블은 tt_ 접두사 13개 — `supabase/migrations/` 참고 |
| `family_members` | family_id, user_id, role(`parent`/`child`), display_name | 계정 ↔ 가족 연결 |
| `periods` | family_id, period_no, start_time, end_time | 교시 시간 정의 (예: 1교시 09:00~09:40). 종 시간이 바뀌면 여기만 고친다 |
| `timetable_items` | family_id, weekday, period_no 또는 start/end_time, title, category(학교/학원/생활), color_key, icon_key, alert_mode(`none`/`notify`/`alarm`), alert_before_min | 시간표 항목. 색·아이콘의 의미 키를 저장하고 실제 모양은 선택된 테마가 해석한다 |
| `day_exceptions` | family_id, date 또는 기간, type(공휴일/방학/재량휴업), note | 이날은 학교 알림 끔 |
| `tasks` | family_id, title, repeat_weekdays 또는 date, remind_time, alert_mode, sticker_reward | 할 일 (요일 반복 / 특정 날짜) |
| `task_completions` | task_id, date, done_at, done_by | 날짜별 완료 기록 |
| `sticker_ledger` | family_id, child_id, delta, reason, task_id, created_at | 보석 지급·사용 내역. 합계가 현재 보석 지급 수 |
| `rewards` | family_id, title, sticker_goal, achieved_at | 보상 목표 (예: 스티커 20개 → 주말 영화) |
| `devices` | user_id, push_token, last_synced_at, scheduled_count, app_version | 푸시 토큰 + 딸 폰 동기화 상태 |

딸 폰에는 같은 구조를 SQLite에 캐시로 둔다. 로컬 단계에서는 SQLite만 사용한다.

---

## 9. Doro에서 재사용할 것

| 항목 | Doro 위치 | 용도 |
|------|-----------|------|
| 알림 채널 · 정확한 알람 권한 확인 · 권한 박탈 안내 | `App.tsx`, `docs/architecture.md` | 알림 기본 설정 |
| 알림 탭 → 화면 이동 (앱 종료 상태 포함) | `src/utils/navigationRef.ts` | 알림에서 해당 화면 열기 |
| 푸시 토큰 관리 | `src/utils/pushTokenManager.ts` | 원격 푸시 |
| 푸시 Edge Function · 설정 가이드 | `supabase/functions/notify-schedule`, `docs/push-notification-setup.md` | 시간표 변경 알림 |
| 자정 전환 + AppState 날짜 갱신 | `RoutineScreen.tsx` | 오늘의 할 일 초기화 |
| 연속 달성 계산 | `src/utils/streakCalc.ts` | "숙제 N일 연속" 칭찬 |
| 공휴일 동기화 | `src/utils/holidaySync.ts` | 공휴일 알림 끄기 |
| 시간 입력 컴포넌트 | `src/components/common/TimeInput.tsx` | 시간표 편집 |
| APK 빌드 · 안드로이드 환경 스크립트 | `scripts/build-apk.ps1`, `scripts/setup-android.ps1` | 빌드 |
| 홈 화면 위젯 (Kotlin) | `android/.../CalendarWidget*.kt` | 나중에 "오늘 시간표" 위젯 |
| 개발 교훈 | Doro `CLAUDE.md` | 한글 TextInput 규칙, Hermes 초기화 크래시, `npx expo install` 규칙, 버전 3파일 동시 수정 |

**새로 만들어야 하는 것**
- **서명 키:** 새로 만든다. Doro 키를 재사용하지 않는다.
- **Firebase:** 기존 프로젝트를 재사용할 수 있지만, 새 패키지명으로 Android 앱을 추가해야 한다.

### Supabase 프로젝트

- **무료 플랜 일시정지:** 1주일 동안 DB 활동이 없으면 일시정지되고, 오래 방치하면 삭제될 수 있다.
  - 매일 쓰면 대부분 문제없지만 방학처럼 쉬는 기간이 있을 수 있다.
  - 서버가 멈춰도 **로컬 캐시로 알림은 계속 울리게** 설계한다.
- **선택지 1: Doro 프로젝트에 테이블 추가**
  - Doro를 매일 쓰므로 일시정지를 피할 수 있다.
  - 두 앱의 데이터가 한 곳에 섞인다.
- **선택지 2: 새 프로젝트**
  - 앱별로 깔끔하게 분리된다.
  - 무료 플랜의 활성 프로젝트 수 제한을 확인해야 한다.

---

## 10. 아이 친화 UI 원칙

관리자 편집 화면에는 2026-10-04 사용자 요청에 따라 별도의 컴팩트한 크기·구조를 적용한다.
아이 화면의 큰 글씨·터치 토큰은 유지하고, 관리자에서는 한 줄 월~일 선택기, 요일별 항목 목록,
필요할 때 여는 편집 폼·시간표 관리 메뉴를 사용한다. 관리자 영역을 나누어 전체 기능을 한 번에 펼치지 않는다.
PIN 보호·저장 규칙·한글 입력·알림 및 위젯 반영은 유지한다. 상세 작업안과 확인 기준은
[`admin-compact-plan.md`](admin-compact-plan.md), 백로그 P9.1~P9.7에 기록한다.

2026-10-04 시간표 보기 후속 요청은 P10으로 관리한다. 주간표는 PNG 기준의 왼쪽 시간 칼럼을
명확히 하고 일정 칸의 모든 시작·종료 시각을 그 시간 칼럼으로 옮긴다. 일정 칸에는 시간 문자열을 남기지 않는다.
현재 시각에 해당하는 일정만 밝게 표시해 나머지 연한 일정과 구분한다.
요일별 다른 요일은 현재 시각 미리보기와 실제 진행 표시를 구별한다. 상세 범위·시간 경계·화면 확인 기준은
[`timetable-readability-plan.md`](timetable-readability-plan.md)에 기록한다.

- **첫 화면은 "지금":** 현재 일정, 다음 일정까지 남은 시간, 오늘 할 일 진행률을 보여 준다.
- **보기 쉽게:** 큰 글씨, 큰 터치 영역, 과목별 색·아이콘을 쓴다. 글보다 그림을 앞세운다.
- **칭찬 중심:** 완료하면 스티커 애니메이션을 보여 준다. 못 한 일은 혼내는 표현 대신 "아직 남았어요"라고 쓴다.
- **실수 방지:** 편집, 설정, 로그아웃처럼 딸이 실수로 바꾸면 안 되는 메뉴는 PIN 뒤에 둔다.
- **시간표 화면:** "오늘" 탭을 기본으로 하고, 주간 보기(요일 × 교시 격자)를 함께 둔다.

### 바꿀 수 있는 아이용 테마

- 아이가 앱 안에서 **번들된 테마**를 직접 고를 수 있게 한다. 테마는 화면의 배경·카드·강조색·과목 색·장식·스티커 분위기를 바꾸되, 큰 글씨·최소 터치 영역·읽기 대비 기준은 항상 유지한다.
- 1단계 테마 계약의 최소 장식·스티커 토큰은 카드 배경·테두리, 강조 도형, 스티커 도형·강조색이다. P4.7은 이 토큰만 소비하며, 이미지 자산·완료/미완료별 스티커 규칙은 해당 화면 작업에서 별도로 정한다.
- 데이터에는 `color_key`, `icon_key` 같은 **의미 키**만 저장한다. 테마를 바꿔도 "수학"이나 "생활"의 의미와 기존 시간표 데이터가 바뀌지 않으며, 테마 레지스트리가 현재 색·아이콘으로 해석한다.
- 선택값은 딸 폰 로컬에 저장한다. 서버 원격 제어는 6단계에서 별도로 범위와 권한을 결정한다.
- 캐릭터 이름은 아이와 이야기할 때의 예시일 뿐이다. 산리오 등 제3자 캐릭터 이미지·로고·폰트는 허가 또는 적절한 라이선스가 확인되기 전에는 앱에 넣지 않는다. 초기 테마는 독자적인 색·도형·스티커 스타일로 만든다.
- 런처 아이콘·스플래시·알림 작은 아이콘은 운영체제 자산이므로 앱 안 테마 전환 대상이 아니다. 최종 브랜딩 작업에서 별도로 확정한다.

---

## 11. 나중에 고려할 기능

- **NEIS 초등학교 시간표 가져오기:** 교육정보 개방 포털의 `elsTimetable` API를 쓴다.
  - 인증키가 필요하다.
  - 2025학년도 데이터부터 API로 조회할 수 있다.
  - 딸 학교 데이터가 실제로 등록되어 있는지 확인이 필요하다.
- **홈 화면 위젯:** 오늘 시간표와 할 일을 보여 준다. Doro 위젯 경험을 활용한다.
- **급식 식단 보기:** NEIS API를 쓴다.
- **방학 모드:** 방학 동안 쓸 별도 시간표.
- **아빠용 주간 리포트:** 할 일 완료율과 스티커 추이.

---

## 12. 결정이 필요한 것

| # | 항목 | 선택지 | 결정 시점 |
|---|------|--------|-----------|
| D1 | 앱 이름 · 패키지명 | 예: `com.sewoong.timetable` | 0단계 |
| D2 | 네비게이션 | Expo Router / React Navigation | 0단계 |
| D3 | 알람 모드 구현 | 자체 Kotlin | 0단계 PoC 완료 |
| D4 | Supabase 프로젝트 | 새 프로젝트 / Doro 프로젝트 재사용 | **결정(2026-10-01): Doro 때 쓰던 Supabase 계정을 쓰고 이 앱의 테이블만 새로 만든다.** 같은 프로젝트에 추가하는지 새 프로젝트인지는 P6.2에서 확정(같은 프로젝트면 테이블 접두사로 Doro와 충돌 방지, 로그인 사용자 풀 공유에 주의). **확정(2026-10-05): Doro 프로젝트에 tt_ 테이블을 추가한다**(매일 쓰는 Doro 덕분에 무료 플랜 1주 미사용 일시정지를 피함). 딸 계정 쓰기 권한은 보상 목표·보석 장부·교시·휴일·지난 날짜 체크까지 모두 허용(D7·P13과 일치). 계정은 아빠·딸 기기용 이메일+비밀번호 2개를 대시보드에서 만든다. 적용은 npx Supabase CLI로 한다. |
| D5 | 시간표 범위 | 학교만 / 학원·생활 일정 포함 | 2단계 전 |
| D6 | 보상 규칙 | 실물 보석을 수동 관리. 개별·하루·주간·월간 자동 지급 없음. 아이가 일반·큰 보석 수를 직접 입력 | 최종 확정(2026-10-04, P13) |
| D7 | 딸 폰 PIN 수정 권한 확인 | 서버 확인(추천) / 화면 잠금만 | **결정(2026-10-01): 화면 잠금만(로컬 확인).** 딸 계정에 시간표·할 일 수정 권한을 준다 |
| D8 | 테마 기본 범위 | 딸 폰 로컬 선택, 번들된 독자 테마, 앱 안 UI만 변경 | 1단계에서 결정됨 |

---

## 참고 자료

- [Schedule exact alarms are denied by default (Android 14)](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- [Schedule alarms — Android Developers](https://developer.android.com/develop/background-work/services/alarms)
- [Play Console: Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/16558241)
- [Full-screen intent limits — AOSP](https://source.android.com/docs/core/permissions/fsi-limits)
- [Behavior changes: Apps targeting Android 14](https://developer.android.com/about/versions/14/behavior-changes-14)
- [Play Console: foreground service and full-screen intent requirements](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en)
- [Expo Notifications 문서](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo: What you need to know about notifications](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [expo/expo #38223 — Headless notifications fail to trigger tasks](https://github.com/expo/expo/issues/38223)
- [expo/expo #29622 — registerTaskAsync not working as expected](https://github.com/expo/expo/issues/29622)
- [Expo changelog (SDK 57, SDK 56)](https://expo.dev/changelog)
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [Notifee is Archived — react-native-notify-kit 소개](https://dev.to/marco_crupi/notifee-is-archived-heres-a-maintained-new-architecture-drop-in-replacement-3ib5)
- [react-native-notify-kit (GitHub)](https://github.com/marcocrupi/react-native-notify-kit)
- [Family Link에서 출처를 알 수 없는 앱 허용 방법 (Bark 가이드)](https://support.bark.us/en/articles/13461179-install-or-update-bark-on-androids-supervised-with-family-link)
- [Family Link 설정 후에도 설치가 막힌 사례 (Pixel Community)](https://support.google.com/pixelphone/thread/245464682/family-link-not-allowing-installation-of-apps-from-unknown-sources-android-14-pixel-5?hl=en)
- [Manage your child's Google Play apps — Google For Families](https://support.google.com/families/answer/7103028?hl=en)
- [Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase Pricing](https://supabase.com/pricing)
- [NEIS 초등학교시간표 Open API](https://open.neis.go.kr/portal/data/service/selectServicePage.do?page=1&rows=10&sortColumn=&sortDirection=&infId=OPEN15020190408160341416743&infSeq=2)
- [공공데이터포털: NEIS 초등학교 시간표](https://www.data.go.kr/data/15122331/openapi.do)



### 2026-10-04 보석 운영 최종 결정

실물 보석을 앱에서 관리한다. 할 일·주간·월간 완료로 보석을 자동 지급하지 않는다.
딸은 PIN 없이 일반·큰 보석 보유량을 직접 수정할 수 있다. 체크는 칭찬·연속 완료 기록만 갱신한다.
기존 보유량은 보존하며 원장 조정으로 실제 개수를 맞춘다. 상세 구현·검증은 P13에서 관리한다.
수량 입력은 저장 시점의 절대 개수로 맞추며 마지막 저장이 우선한다. 사용자가 이번 범위를 자동 지급 중단과 수량 편집으로 한정했다. 기존 선물 교환·보상 목표의 추가 개편은 진행하지 않으며 Claude에서 이어서 개발한다.
P4.6 등 이전 작업의 자동 적립·회수·주간 지급 검증은 이 결정으로 폐기한다. 칭찬·완료 이력·연속 완료 및 실기기 확인 조건은 유지한다.
캐릭터 테마는 하늘색 구름·긴 귀 캐릭터와 보라색 장난꾸러기 캐릭터로 시각 차이를 강화하고 P12에서 별도로 진행한다.
