package com.sewoong.kidtimetable.widget
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** 기기 로컬 시각 기준의 날짜(yyyy-MM-dd)와 시각(HH:mm). 같은 순간(Date)에서 둘 다 만들어야 자정 경계에서 어긋나지 않는다. */
object WidgetClock {
  fun today(now: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now)
  fun time(now: Date): String = SimpleDateFormat("HH:mm", Locale.US).format(now)
}

object WidgetRefreshScheduler {
  /** 오늘 일정의 다음 시작·끝 시각, 또는 자정 직후 중 더 빠른 때에 위젯을 다시 그린다. */
  fun scheduleNext(context: Context, snapshot: WidgetSnapshot?) {
    val next = WidgetDayResolver.nextRefreshAtMillis(System.currentTimeMillis(), TimeZone.getDefault(), snapshot)
    val operation = PendingIntent.getBroadcast(context, 5504, Intent(context, WidgetRefreshReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).apply { cancel(operation); setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, operation) }
  }
}
