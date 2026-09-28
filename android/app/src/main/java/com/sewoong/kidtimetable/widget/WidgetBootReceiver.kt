package com.sewoong.kidtimetable.widget
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.sewoong.kidtimetable.alarm.NotificationPocScheduler
import com.sewoong.kidtimetable.alarm.RollingAlarmScheduler
class WidgetBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Log.i("TimeTableBoot", "Restoring scheduled work after ${intent.action}")
    runCatching { WidgetDataStore.read(context)?.let { WidgetRefreshScheduler.scheduleNext(context, it.toString()) } }
      .onFailure { Log.w("TimeTableBoot", "Widget restore failed", it) }
    runCatching { NotificationPocScheduler.restoreAfterBoot(context) }
      .onFailure { Log.w("TimeTableBoot", "Notification PoC restore failed", it) }
    runCatching { RollingAlarmScheduler.restoreAfterBoot(context) }
      .onFailure { Log.w("TimeTableBoot", "Rolling schedule restore failed", it) }
  }
}
