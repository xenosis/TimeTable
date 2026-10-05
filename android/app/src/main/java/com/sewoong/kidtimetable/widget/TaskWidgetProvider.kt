package com.sewoong.kidtimetable.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import java.util.Date

/** 오늘 할 일 위젯. 일정 위젯과 같은 데이터 파일을 읽어 오늘 날짜의 할 일과 완료 상태를 보여준다. */
class TaskWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val snapshot = WidgetDataStore.readSnapshot(context)
    val today = WidgetClock.today(Date())
    val touched = WidgetCheckStore.touched(context, today)
    // 갱신 시각 예약은 일정 위젯과 같은 경로(자정 직후 포함)를 쓴다
    runCatching { WidgetRefreshScheduler.scheduleNext(context, snapshot) }
    ids.forEach { id ->
      val view = WidgetTaskView.build(snapshot, today, WidgetTaskView.capacityFor(WidgetRenderSupport.heightDp(context, manager, id, DEFAULT_HEIGHT_DP), WidgetRenderSupport.fontScale(context)), touched)
      manager.updateAppWidget(id, TaskWidgetRenderer.render(context, view, snapshot?.theme))
    }
  }

  /** 사용자가 위젯 크기를 바꾸면 보이는 줄 수도 다시 정한다. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
    onUpdate(context, manager, intArrayOf(id))
  }

  private companion object { const val DEFAULT_HEIGHT_DP = 110 }
}
