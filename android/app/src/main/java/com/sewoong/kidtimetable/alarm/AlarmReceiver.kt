package com.sewoong.kidtimetable.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** AlarmManager wakes the app here; the actual sound + full-screen notification are owned by
 * AlarmSoundService so they keep running even if Android only shows a heads-up banner. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val scheduleId = intent.getStringExtra("scheduleId") ?: "unknown"
    val title = intent.getStringExtra("title") ?: "할 일"
    TimeTableNotificationChannels.ensure(context)
    AlarmSoundService.start(context, scheduleId, title)
  }
  companion object { const val CHANNEL_ID = TimeTableNotificationChannels.ALARM_CHANNEL_ID; const val NOTIFICATION_ID = 8108 }
}
