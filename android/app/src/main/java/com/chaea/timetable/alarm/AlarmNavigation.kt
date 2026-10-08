package com.chaea.timetable.alarm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.chaea.timetable.MainActivity

/** Resolves a rolling-schedule entry id (`"<itemId>:<date>"` for timetable, `"task:<id>:<date>:<suffix>"`
 * for tasks) to where tapping it should take the user. Tasks have no detail route, so they open home. */
object AlarmNavigation {
  private const val TASK_PREFIX = "task:"

  fun isTask(scheduleId: String): Boolean = scheduleId.startsWith(TASK_PREFIX)

  fun deepLinkUri(scheduleId: String): Uri {
    if (isTask(scheduleId)) return Uri.parse("kidtimetable:///")
    val itemId = scheduleId.substringBefore(':').toIntOrNull() ?: return Uri.parse("kidtimetable:///")
    return Uri.parse("kidtimetable://schedule/$itemId")
  }

  fun pageIntent(context: Context, scheduleId: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, deepLinkUri(scheduleId)).setClass(context, MainActivity::class.java)
    val requestCode = scheduleId.substringBefore(':').toIntOrNull() ?: 0
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun displayTitle(scheduleId: String, isAlarm: Boolean): String {
    val subject = if (isTask(scheduleId)) "할 일" else "시간표"
    return if (isAlarm) "$subject 알람" else "$subject 알림"
  }
}
