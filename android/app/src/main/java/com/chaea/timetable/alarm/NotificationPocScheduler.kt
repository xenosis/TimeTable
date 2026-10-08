package com.chaea.timetable.alarm
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
object NotificationPocScheduler {
 private const val PREFS = "notification-poc"
 private const val TRIGGER_AT = "trigger-at"
 const val CHANNEL_ID = "timetable-poc"
 private const val REQUEST_CODE = 8100

 fun schedule(context: Context, triggerAt: Long) {
  val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  check(preferences.edit().putLong(TRIGGER_AT, triggerAt).commit()) { "알림 예약 정보를 저장하지 못했어요." }
  val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation(context))
 }

 fun restoreAfterBoot(context: Context) {
  val triggerAt = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(TRIGGER_AT, 0)
  if (triggerAt == 0L) return
  if (triggerAt <= System.currentTimeMillis()) post(context, "재부팅 중 놓친 일반 알림이에요.") else schedule(context, triggerAt)
 }

 fun deliver(context: Context) = post(context, "예약한 일반 알림이에요.")

 private fun post(context: Context, body: String) {
  context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(TRIGGER_AT).apply()
  val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
   manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "채아시간표 알림 확인", NotificationManager.IMPORTANCE_HIGH))
  }
  manager.notify(REQUEST_CODE, NotificationCompat.Builder(context, CHANNEL_ID)
   .setSmallIcon(com.chaea.timetable.R.drawable.notification_icon)
   .setContentTitle("채아시간표 알림 확인")
   .setContentText(body)
   .setAutoCancel(true)
   .build())
 }

 private fun operation(context: Context) = PendingIntent.getBroadcast(
  context,
  REQUEST_CODE,
  Intent(context, NotificationPocReceiver::class.java),
  PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
 )
}
