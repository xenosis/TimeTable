package com.sewoong.kidtimetable.widget
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
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
    val operation = PendingIntent.getBroadcast(context, 5504, Intent(context, WidgetRefreshReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // 위젯을 모두 지웠다면 일정 경계와 자정마다 깨우는 알람을 이어 가지 않는다(배터리). 다시 올리면 제공자가 이 함수를 불러 예약이 되살아난다.
    if (!WidgetUpdater.hasWidgets(context)) { alarms.cancel(operation); return }
    val next = WidgetDayResolver.nextRefreshAtMillis(System.currentTimeMillis(), TimeZone.getDefault(), snapshot)
    alarms.cancel(operation)
    // 일정 시작·끝 시각에 맞춰 위젯이 바뀌어야 하므로 정확한 알람을 쓴다. setAndAllowWhileIdle은 딸 폰에서 1~6분 넘게 늦어졌다(2026-10-05).
    // 앱은 알람 기능 때문에 정확한 알람 권한이 있고, 권한이 없으면 1분 범위 안에서 울리게 한다.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, operation)
    } else {
      alarms.setWindow(AlarmManager.RTC_WAKEUP, next, 60_000L, operation)
    }
  }
}
