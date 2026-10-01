package com.sewoong.kidtimetable.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/** Replaces the app-owned rolling schedule so a refresh cannot leave duplicate alarms behind. */
object RollingAlarmScheduler {
  const val GENERAL_CHANNEL_ID = TimeTableNotificationChannels.GENERAL_CHANNEL_ID
  private const val PREFS = "rolling-alarm-schedule"
  private const val CURRENT_ENTRIES = "current_entries"
  private const val PENDING_ENTRIES = "pending_entries"
  @Volatile private var testInterruptionStage: String? = null

  /** Debug-only test receiver uses this to prove pending-generation recovery without exposing a release feature. */
  internal fun setTestInterruptionStage(stage: String?) { testInterruptionStage = stage }

  @Synchronized fun replace(context: Context, entries: List<Entry>, owner: String = "timetable") {
    // JS builds a future window, but an entry can cross its trigger time before this native boundary runs.
    val now = System.currentTimeMillis()
    val freshEntries = entries.filter { it.triggerAt > now }
    val preferences = context.getSharedPreferences("$PREFS-$owner", Context.MODE_PRIVATE)
    val oldCurrent = entriesFrom(preferences, CURRENT_ENTRIES)
    val oldPending = entriesFrom(preferences, PENDING_ENTRIES)
    // Store the next generation first. A reboot or process kill can then safely complete it.
    if (!preferences.edit().putString(PENDING_ENTRIES, encode(freshEntries)).commit()) throw IllegalStateException("Could not save pending schedule")
    interruptForTest("after_pending")
    cancelEntries(context, oldCurrent + oldPending + entries)
    val scheduled = mutableListOf<Entry>()
    try {
      freshEntries.forEach { entry ->
        schedule(context, entry)
        scheduled += entry
        if (scheduled.size == 1) interruptForTest("after_first_schedule")
      }
      if (!preferences.edit().putString(CURRENT_ENTRIES, encode(freshEntries)).remove(PENDING_ENTRIES).commit()) throw IllegalStateException("Could not save schedule")
    } catch (error: Exception) {
      scheduled.forEach { cancel(context, it.id) }
      // Keep PENDING_ENTRIES: the boot receiver can retry the complete generation safely.
      throw error
    }
  }

  /** Removes every app-owned rolling reservation even when new scheduling is unavailable. */
  @Synchronized fun clear(context: Context, owner: String = "timetable") {
    val preferences = context.getSharedPreferences("$PREFS-$owner", Context.MODE_PRIVATE)
    val oldCurrent = entriesFrom(preferences, CURRENT_ENTRIES)
    val oldPending = entriesFrom(preferences, PENDING_ENTRIES)
    if (!preferences.edit().putString(PENDING_ENTRIES, encode(emptyList())).commit()) throw IllegalStateException("Could not save pending deletion")
    cancelEntries(context, oldCurrent + oldPending)
    if (!preferences.edit().putString(CURRENT_ENTRIES, encode(emptyList())).remove(PENDING_ENTRIES).commit()) throw IllegalStateException("Could not save schedule deletion")
  }

  /** Re-registers the durable generation after BOOT_COMPLETED, including a replacement interrupted mid-flight.
   * One owner's failure must not block the other owner's restore. */
  @Synchronized fun restoreAfterBoot(context: Context) {
    val failures = listOf("timetable", "tasks").mapNotNull { owner ->
      runCatching { restoreOwnerAfterBoot(context, owner) }.exceptionOrNull()?.let { owner to it }
    }
    failures.firstOrNull()?.let { (_, error) -> throw error }
  }
  private fun restoreOwnerAfterBoot(context: Context, owner: String) {
    val preferences = context.getSharedPreferences("$PREFS-$owner", Context.MODE_PRIVATE)
    val saved = if (preferences.contains(PENDING_ENTRIES)) entriesFrom(preferences, PENDING_ENTRIES) else entriesFrom(preferences, CURRENT_ENTRIES)
    replace(context, saved.filter { it.triggerAt > System.currentTimeMillis() }, owner)
  }

  private fun cancelEntries(context: Context, entries: List<Entry>) = entries.map { it.id }.toSet().forEach { cancel(context, it) }
  private fun interruptForTest(stage: String) {
    if (testInterruptionStage == stage) throw IllegalStateException("Debug replacement interruption at $stage")
  }
  private fun encode(entries: List<Entry>) = JSONArray().apply { entries.forEach { put(JSONObject().put("id", it.id).put("title", it.title).put("memo", it.memo).put("triggerAt", it.triggerAt).put("isAlarm", it.isAlarm)) } }.toString()
  private fun entriesFrom(preferences: android.content.SharedPreferences, key: String): List<Entry> = try {
    val values = JSONArray(preferences.getString(key, "[]"))
    (0 until values.length()).map { index -> values.getJSONObject(index).let { Entry(it.getString("id"), it.getString("title"), it.getLong("triggerAt"), it.getBoolean("isAlarm"), it.optString("memo", "")) } }
  } catch (_: Exception) { emptyList() }

  private fun schedule(context: Context, entry: Entry) {
    val receiver = if (entry.isAlarm) AlarmReceiver::class.java else RollingNotificationReceiver::class.java
    val intent = Intent(context, receiver).setData(uri(entry.id)).putExtra("scheduleId", entry.id).putExtra("title", entry.title).putExtra("memo", entry.memo)
    val operation = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (entry.isAlarm) {
      alarms.setAlarmClock(AlarmManager.AlarmClockInfo(entry.triggerAt, AlarmNavigation.pageIntent(context, entry.id)), operation)
    } else alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.triggerAt, operation)
  }

  private fun cancel(context: Context, id: String) {
    listOf(AlarmReceiver::class.java, RollingNotificationReceiver::class.java).forEach { receiver ->
      val operation = PendingIntent.getBroadcast(context, 0, Intent(context, receiver).setData(uri(id)), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
      if (operation != null) { (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(operation); operation.cancel() }
    }
  }

  fun postGeneralNotification(context: Context, id: String, title: String, memo: String = "") {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    TimeTableNotificationChannels.ensure(context)
    manager.notify(id, 0, NotificationCompat.Builder(context, GENERAL_CHANNEL_ID)
      .setSmallIcon(com.sewoong.kidtimetable.R.drawable.notification_icon)
      .setContentTitle(AlarmNavigation.displayTitle(id, isAlarm = false))
      .setContentText(AlarmMemoText.body(title, memo))
      .setStyle(NotificationCompat.BigTextStyle().bigText(AlarmMemoText.body(title, memo)))
      .setContentIntent(AlarmNavigation.pageIntent(context, id))
      .setAutoCancel(true)
      .build())
  }

  private fun uri(id: String) = Uri.parse("kidtimetable://scheduled/${Uri.encode(id)}")
  data class Entry(val id: String, val title: String, val triggerAt: Long, val isAlarm: Boolean, val memo: String = "")
}

class RollingNotificationReceiver : android.content.BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = RollingAlarmScheduler.postGeneralNotification(context, intent.getStringExtra("scheduleId") ?: "unknown", intent.getStringExtra("title") ?: "일정", intent.getStringExtra("memo") ?: "")
}
