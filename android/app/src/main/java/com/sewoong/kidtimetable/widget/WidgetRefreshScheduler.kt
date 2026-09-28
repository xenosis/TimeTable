package com.sewoong.kidtimetable.widget
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.util.Calendar
object WidgetRefreshScheduler {
  fun scheduleNext(context: Context, payload: String) {
    val now = Calendar.getInstance(); var next: Long? = null
    val times = JSONObject(payload).optJSONArray("schedule") ?: return
    for (index in 0 until times.length()) for (key in arrayOf("startTime", "endTime")) {
      val parts = times.optJSONObject(index)?.optString(key)?.split(':')?.mapNotNull { it.toIntOrNull() } ?: continue
      if (parts.size != 2) continue
      val candidate = (now.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, parts[0]); set(Calendar.MINUTE, parts[1]); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
      if (candidate > System.currentTimeMillis() && (next == null || candidate < next!!)) next = candidate
    }
    val midnight = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 1) }.timeInMillis
    if (next == null || midnight < next!!) next = midnight
    val operation = PendingIntent.getBroadcast(context, 5504, Intent(context, WidgetRefreshReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).apply { cancel(operation); setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next!!, operation) }
  }
}
