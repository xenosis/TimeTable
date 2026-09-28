package com.sewoong.kidtimetable.alarm

import java.util.UUID

/** MainActivity가 알람 화면의 키가드 해제 직후 넘어왔다는 걸 증명하는 일회용 토큰.
 * 외부 앱은 이 프로세스의 static 메모리를 조작할 수 없으므로, intent extra 값만 보고
 * 잠금화면 우회 플래그(showWhenLocked)를 켜는 것보다 안전하다. */
object AlarmHandoff {
  private const val VALID_MS = 5_000L
  private var token: String? = null
  private var expiresAt: Long = 0

  fun issue(): String {
    val value = UUID.randomUUID().toString()
    token = value
    expiresAt = System.currentTimeMillis() + VALID_MS
    return value
  }

  fun consume(candidate: String?): Boolean {
    val valid = candidate != null && candidate == token && System.currentTimeMillis() <= expiresAt
    token = null
    return valid
  }
}
