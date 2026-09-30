package com.sewoong.kidtimetable.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Debug APK only: creates an interrupted replacement that the next boot (WidgetBootReceiver) must recover. Trigger times are +20/+21 min so they are still in the future after a reboot and unlock. */
class RollingScheduleTestReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val stage = intent.getStringExtra("stage") ?: "after_pending"
    val owner = intent.getStringExtra("owner") ?: "timetable"
    val now = System.currentTimeMillis()
    val entries = listOf(
      RollingAlarmScheduler.Entry("debug-interruption:$owner:first", "중단 복구 첫 예약", now + 20 * 60_000, false),
      RollingAlarmScheduler.Entry("debug-interruption:$owner:second", "중단 복구 두번째 예약", now + 21 * 60_000, true),
    )
    RollingAlarmScheduler.setTestInterruptionStage(stage)
    try {
      RollingAlarmScheduler.replace(context, entries, owner)
      Log.e("TimeTableTest", "Expected replacement interruption did not occur: $stage ($owner)")
    } catch (error: IllegalStateException) {
      Log.i("TimeTableTest", "Injected replacement interruption: $stage ($owner)")
    } finally {
      RollingAlarmScheduler.setTestInterruptionStage(null)
    }
  }
}
