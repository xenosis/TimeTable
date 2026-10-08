package com.chaea.timetable.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/** 일정·할 일 위젯을 함께 다시 그린다. 데이터가 바뀌었거나 갱신 시각이 됐을 때 쓴다. */
object WidgetUpdater {
  /** 홈 화면에 일정 또는 할 일 위젯이 하나라도 올라가 있는지. */
  fun hasWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    return manager.getAppWidgetIds(ComponentName(context, TodayWidgetProvider::class.java)).isNotEmpty() ||
      manager.getAppWidgetIds(ComponentName(context, TaskWidgetProvider::class.java)).isNotEmpty()
  }

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val schedule = manager.getAppWidgetIds(ComponentName(context, TodayWidgetProvider::class.java))
    if (schedule.isNotEmpty()) TodayWidgetProvider().onUpdate(context, manager, schedule)
    val tasks = manager.getAppWidgetIds(ComponentName(context, TaskWidgetProvider::class.java))
    if (tasks.isNotEmpty()) TaskWidgetProvider().onUpdate(context, manager, tasks)
  }
}
