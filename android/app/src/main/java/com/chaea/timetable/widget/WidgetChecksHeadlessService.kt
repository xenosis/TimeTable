package com.chaea.timetable.widget

import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * 할 일 위젯 체크를 앱 화면 없이 곧바로 DB에 기록하는 JS 작업(`TimeTableWidgetChecks`)을 실행한다.
 * 위젯 쪽은 대기 파일만 쓰고(DB는 앱만 쓴다), 이 서비스가 JS를 깨워 앱 안 체크와 같은 규칙으로 기록·알림 재예약·위젯 갱신을 한다.
 * 서비스를 시작할 수 없는 환경이면 대기 파일이 남아 앱 실행이나 15분 백그라운드 작업 때 반영된다.
 */
class WidgetChecksHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    // 앱이 열려 있어도 실행한다(같은 갱신이 겹쳐도 JS 쪽에서 하나로 합쳐 처리한다)
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)

  companion object {
    const val TASK_NAME = "TimeTableWidgetChecks"
    private const val TIMEOUT_MS = 30_000L

    /** 시작에 성공하면 true. 백그라운드 서비스 시작 제한 등으로 실패해도 예외를 밖으로 내지 않는다. */
    fun start(context: Context): Boolean = runCatching {
      context.startService(Intent(context, WidgetChecksHeadlessService::class.java))
    }.onFailure { Log.w("TimeTable", "위젯 체크 즉시 반영을 시작하지 못해 대기 기록으로 남깁니다.", it) }.isSuccess
  }
}
