package com.sewoong.kidtimetable.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import com.sewoong.kidtimetable.R
import java.util.Date

/** 오늘 할 일 위젯. 일정 위젯과 같은 데이터 파일을 읽어 오늘 날짜의 할 일과 완료 상태를 스크롤 목록으로 보여준다. */
class TaskWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val snapshot = WidgetDataStore.readSnapshot(context)
    // 갱신 시각 예약은 일정 위젯과 같은 경로(자정 직후 포함)를 쓴다
    runCatching { WidgetRefreshScheduler.scheduleNext(context, snapshot) }
    val view = WidgetTaskView.build(snapshot, WidgetClock.today(Date()))
    ids.forEach { id -> manager.updateAppWidget(id, TaskWidgetRenderer.render(context, id, view, snapshot?.theme)) }
    // 체크 결과가 목록 줄에 바로 보이도록 항목도 다시 만든다
    manager.notifyAppWidgetViewDataChanged(ids, R.id.task_list)
  }

  /** 위젯 크기를 바꾸면 목록이 새 크기에 맞춰 다시 그려지도록 갱신한다. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
    onUpdate(context, manager, intArrayOf(id))
  }
}
