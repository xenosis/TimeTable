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
    val operation = PendingIntent.getBroadcast(context, 5504, Intent(context, WidgetRefreshReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // 위젯을 모두 지웠다면 일정 경계와 자정마다 깨우는 알람을 이어 가지 않는다(배터리). 다시 올리면 제공자가 이 함수를 불러 예약이 되살아난다.
    if (!WidgetUpdater.hasWidgets(context)) { alarms.cancel(operation); return }
    val next = WidgetDayResolver.nextRefreshAtMillis(System.currentTimeMillis(), TimeZone.getDefault(), snapshot)
    alarms.apply { cancel(operation); setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, operation) }
  }

  /** 위젯에서 줄을 누른 뒤, 누른 줄을 남겨 두는 시간이 지나면 위젯을 한 번 다시 그려 남은 할 일이 올라오게 한다. set()은 기기에서 45초 넘게 늦어져(딸 폰 확인) 5초 범위의 setWindow를 쓴다(정확한 알람 권한 불필요). */
  fun scheduleTouchRelease(context: Context) {
    val operation = PendingIntent.getBroadcast(context, 5505, Intent(context, WidgetRefreshReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.setWindow(AlarmManager.RTC, System.currentTimeMillis() + WidgetChecks.TOUCH_HOLD_MILLIS + 1_000L, 5_000L, operation)
  }
}
