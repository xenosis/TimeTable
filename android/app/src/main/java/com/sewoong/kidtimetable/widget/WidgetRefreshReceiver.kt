package com.sewoong.kidtimetable.widget
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

class WidgetRefreshReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) {
  runCatching { WidgetRefreshScheduler.scheduleNext(context, WidgetDataStore.readSnapshot(context)) }
  val manager = AppWidgetManager.getInstance(context); val provider = ComponentName(context, TodayWidgetProvider::class.java)
  TodayWidgetProvider().onUpdate(context, manager, manager.getAppWidgetIds(provider))
} }
