package com.sewoong.kidtimetable.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object TimeTableNotificationChannels {
  const val GENERAL_CHANNEL_ID = "timetable-general-notifications"
  const val ALARM_CHANNEL_ID = "timetable-secure-alarm"

  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(GENERAL_CHANNEL_ID, "TimeTable 알림", NotificationManager.IMPORTANCE_HIGH).apply { description = "시간표와 할 일 알림" })
    manager.createNotificationChannel(NotificationChannel(ALARM_CHANNEL_ID, "TimeTable 알람", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "잠금 화면 전체화면 알람"
      setSound(null, null)
      enableVibration(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    })
  }
}
