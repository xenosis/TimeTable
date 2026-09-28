package com.sewoong.kidtimetable.widget
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
class WidgetRefreshReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) {
  WidgetDataStore.read(context)?.let { WidgetRefreshScheduler.scheduleNext(context, it.toString()) }
  val manager = AppWidgetManager.getInstance(context); val provider = ComponentName(context, TodayWidgetProvider::class.java)
  TodayWidgetProvider().onUpdate(context, manager, manager.getAppWidgetIds(provider))
} }
