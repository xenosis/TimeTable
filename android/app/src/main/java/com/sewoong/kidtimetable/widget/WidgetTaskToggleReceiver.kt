package com.sewoong.kidtimetable.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.Date

/** 할 일 위젯의 줄을 눌렀을 때 받는다. 그 할 일의 완료 상태를 뒤집고(완료 ↔ 미완료) 위젯을 바로 다시 그린다. */
class WidgetTaskToggleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val taskId = intent.getIntExtra(EXTRA_TASK_ID, -1)
    val date = intent.getStringExtra(EXTRA_DATE).orEmpty()
    if (taskId < 0 || date.isBlank()) return
    // 자정 직후처럼 위젯이 아직 어제 화면인 채로 눌리면 어제 날짜로 기록되지 않게, 오늘이 아닌 날짜의 줄은 무시하고 위젯만 새로 그린다
    val toggled = date == WidgetClock.today(Date()) && runCatching { WidgetCheckStore.toggle(context, taskId, date) }.isSuccess
    WidgetUpdater.updateAll(context)
    // 앱을 열지 않아도 끝낸 할 일의 알림이 울리지 않게, 대기 체크를 곧바로 DB에 기록하고 알림을 다시 예약한다
    if (toggled) WidgetChecksHeadlessService.start(context)
  }

  companion object {
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_DATE = "date"
  }
}
