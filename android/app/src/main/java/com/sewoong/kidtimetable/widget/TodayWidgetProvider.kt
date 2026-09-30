package com.sewoong.kidtimetable.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import java.util.Date

/** 오늘 일정 위젯. 정규 수업을 뺀 학원·방과후·돌봄·생활 일정을 시간순으로 보여준다. */
class TodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    // 저장된 7일치에서 기기 로컬 '오늘'의 항목을 골라 쓴다. 앱을 열지 않아도 날짜가 바뀌면 새 날짜 일정이 나온다.
    val snapshot = WidgetDataStore.readSnapshot(context)
    val now = Date() // 날짜와 시각을 같은 순간에서 만들어 자정 경계에서 어긋나지 않게 한다
    // 위젯을 새로 올렸거나 알람이 사라졌어도 그릴 때마다 다음 갱신이 다시 예약된다
    runCatching { WidgetRefreshScheduler.scheduleNext(context, snapshot) }
    ids.forEach { id ->
      val view = WidgetScheduleView.build(snapshot, WidgetClock.today(now), WidgetClock.time(now), WidgetScheduleView.capacityFor(WidgetRenderSupport.heightDp(context, manager, id, DEFAULT_HEIGHT_DP), WidgetRenderSupport.fontScale(context)))
      manager.updateAppWidget(id, ScheduleWidgetRenderer.render(context, view, snapshot?.theme))
    }
  }

  /** 사용자가 위젯 크기를 바꾸면 보이는 줄 수도 다시 정한다. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
    onUpdate(context, manager, intArrayOf(id))
  }

  private companion object { const val DEFAULT_HEIGHT_DP = 110 }
}
