# backlog CLI

`backlog.json`을 조회하고 명시적으로 변경하는 Node.js CLI다. 조회 명령은 파일을 수정하지 않으며 `gate`를 포함한 데이터 문자열을 실행하지 않는다.

## 조회

```powershell
npm run backlog -- list
npm run backlog -- list --status todo --category spike --json
npm run backlog -- list --parent P1 --owner null
npm run backlog -- get P1.3 --json
npm run backlog -- next --json
```

`next`는 `todo` 상태의 하위 작업 중 모든 `deps`가 `done`인 항목만 반환한다. 하위 작업을 가진 단계 작업은 후보에서 제외한다. `--owner`, `--offset`, `--limit`, `--all`을 함께 사용할 수 있다.

기본 목록은 `done`, `cancelled`를 제외하고 최대 50개를 보여준다. `nextOffset`이 있으면 `--offset`으로 다음 페이지를 조회한다. 모든 작업을 누락 없이 문서화하려면 다음 명령을 사용한다.

```powershell
npm run backlog -- list --all --json
```

모든 조회 결과에는 절대 경로, `$schema_version`, SHA-256, 바이트 수, 수정 시각이 포함된다. 같은 입력인지 확인할 때 SHA-256을 비교한다.

## 변경

변경 전에 조회 결과의 `source.sha256`을 복사한다. `add`와 `set-status`는 `--expect-hash`가 없거나 현재 파일과 다르면 원본을 변경하지 않는다.

```powershell
npm run backlog -- add --id P1.9 --title "품질 도구" --category infra --summary "개발 검증 도구를 구성한다." --done-when "npm run check 통과" --est 30 --parent P1 --expect-hash <SHA256>

npm run backlog -- set-status P1.9 in_progress --owner codex --note "품질 기반 작업 착수" --expect-hash <SHA256>

npm run backlog -- set-status P1.9 in_review --note "구현과 격리 검증 완료" --expect-hash <SHA256>

npm run backlog -- set-status P1.9 done --evidence "CLI와 hook 검증 완료" --verification "npm run check 통과" --expect-hash <SHA256>
```

`add` 필수값은 `id`, `title`, `category`, `summary`, `done-when`, `expect-hash`다. ID는 기존 형식인 `P숫자` 또는 `P숫자.숫자`만 허용한다. 부모·의존성 참조, 중복 ID, 순환 참조, enum 및 `max_est_min`을 저장 전에 검사한다.

상태 전이는 다음과 같다.

- `todo` → `in_progress`, `needs_info`, `blocked`, `cancelled`
- `in_progress` → `in_review`, `needs_info`, `blocked`, `cancelled`
- `in_review` → `done`, `needs_info`, `blocked`, `cancelled`
- `needs_info`, `blocked` → `todo`, `in_progress`
- `done`, `cancelled` → 변경 불가

`needs_info`와 `blocked`에는 `--note`가 필수다. `done`에는 `--evidence`와 `--verification`이 필수이며 완료 조건, 모든 deps, 모든 하위 작업의 완료 상태를 검사한다. 검증 문자열은 기록만 하며 명령으로 실행하지 않는다.

각 변경은 대상 옆 `.backlog-backups/`에 변경 전 사본을 만든다. CLI 변경끼리는 잠금 파일로 직렬화하고, 잠금 획득 후와 원자적 교체 직전에 기대 SHA-256을 다시 검사한다. 충돌·파싱·스키마 오류가 나면 원본을 보존한다.

## 다른 파일로 안전하게 시험

실제 백로그 대신 격리한 사본을 사용할 때만 `--file`을 지정한다.

```powershell
npm run backlog -- list --all --json --file C:\temp\backlog.json
```

## 직접 읽기 제한

Claude Code의 프로젝트 `PreToolUse` hook은 기준 `backlog.json`에 대한 `Read`, 광범위한 `Grep`, 흔한 Bash/PowerShell 직접 읽기 명령을 차단하고 위 CLI 사용법을 안내한다. 일반 문서 읽기와 검증된 CLI 호출은 허용한다. 이는 실수 방지 장치이며 임의 셸 코드의 모든 우회를 막는 보안 경계가 아니다.
