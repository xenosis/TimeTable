package com.chaea.timetable.widget
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetRefreshReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) {
  runCatching { WidgetRefreshScheduler.scheduleNext(context, WidgetDataStore.readSnapshot(context)) }
  WidgetUpdater.updateAll(context)
} }
