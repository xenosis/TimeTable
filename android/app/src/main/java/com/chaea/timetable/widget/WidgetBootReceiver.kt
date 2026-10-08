package com.chaea.timetable.widget
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.chaea.timetable.alarm.NotificationPocScheduler
import com.chaea.timetable.alarm.RollingAlarmScheduler
class WidgetBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Log.i("TimeTableBoot", "Restoring scheduled work after ${intent.action}")
    // 부팅·시간·시간대 변경·앱 업데이트 뒤에는 다음 갱신 시각을 다시 잡고, 옛 날짜·상태가 남지 않게 위젯을 바로 다시 그린다
    runCatching { WidgetRefreshScheduler.scheduleNext(context, WidgetDataStore.readSnapshot(context)); WidgetUpdater.updateAll(context) }
      .onFailure { Log.w("TimeTableBoot", "Widget restore failed", it) }
    runCatching { NotificationPocScheduler.restoreAfterBoot(context) }
      .onFailure { Log.w("TimeTableBoot", "Notification PoC restore failed", it) }
    runCatching { RollingAlarmScheduler.restoreAfterBoot(context) }
      .onFailure { Log.w("TimeTableBoot", "Rolling schedule restore failed", it) }
  }
}
