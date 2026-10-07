package com.sewoong.kidtimetable.alarm
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.provider.Settings
import android.os.PowerManager
import com.sewoong.kidtimetable.MainActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
class AlarmPocModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
 override fun getName() = "SecureAlarmPoc"
 @ReactMethod fun setChildAlarmsSuppressed(suppressed: Boolean, promise: Promise) {
  try { RollingAlarmScheduler.setChildAlarmsSuppressed(context, suppressed); promise.resolve(null) }
  catch (error: Exception) { promise.reject("DEVICE_ALARM_POLICY_FAILED", "기기 알림 설정을 적용하지 못했어요.", error) }
 }
 @ReactMethod fun initializeChannels(promise: Promise) {
  TimeTableNotificationChannels.ensure(context)
  promise.resolve(null)
 }
 @ReactMethod fun replaceRollingSchedule(entries: ReadableArray, owner: String, promise: Promise) {
  try {
   val scheduled = (0 until entries.size()).map { index ->
    val entry = entries.getMap(index) ?: throw IllegalArgumentException("Missing schedule entry")
    RollingAlarmScheduler.Entry(entry.getString("id") ?: throw IllegalArgumentException("Missing id"), entry.getString("title") ?: "일정", entry.getDouble("triggerAt").toLong(), entry.getString("mode") == "alarm", entry.getString("memo") ?: "")
   }
   var scheduledCount = 0
   synchronized(RollingAlarmScheduler) {
    val freshScheduled = scheduled.filter { it.triggerAt > System.currentTimeMillis() }
    scheduledCount = freshScheduled.size
    if (freshScheduled.isEmpty()) RollingAlarmScheduler.clear(context, owner)
    else {
     try {
     val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
     val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
     val battery = context.getSystemService(Context.POWER_SERVICE) as PowerManager
     if (!notifications.areNotificationsEnabled()) throw IllegalStateException("Notifications are disabled")
     if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) throw IllegalStateException("Exact alarms are disabled")
     if (!battery.isIgnoringBatteryOptimizations(context.packageName)) throw IllegalStateException("Battery optimization exception is disabled")
     if (freshScheduled.any { it.isAlarm } && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && !notifications.canUseFullScreenIntent()) throw IllegalStateException("Full screen alarms are disabled")
     } catch (error: Exception) {
      RollingAlarmScheduler.clear(context, owner)
      throw error
     }
     RollingAlarmScheduler.replace(context, freshScheduled, owner)
   }
   }
   promise.resolve(scheduledCount)
  } catch (error: Exception) { promise.reject("ROLLING_SCHEDULE_FAILED", "알림을 다시 예약하지 못했어요.", error) }
 }
 @ReactMethod fun canUseFullScreenIntent(promise: Promise) {
  val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
  promise.resolve(allowed)
 }
 @ReactMethod fun getPermissionStatus(promise: Promise) {
  val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  val battery = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  promise.resolve(Arguments.createMap().apply {
   val notificationPermissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
     context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
   putBoolean("notifications", notificationPermissionGranted && notifications.areNotificationsEnabled())
   putBoolean("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms())
   putBoolean("fullScreen", Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || notifications.canUseFullScreenIntent())
   putBoolean("battery", battery.isIgnoringBatteryOptimizations(context.packageName))
  })
 }
 @ReactMethod fun openPermissionSettings(kind: String, promise: Promise) {
  try {
   val intent = when (kind) {
    "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    "exactAlarms" -> Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
    "fullScreen" -> Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
    "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
    else -> throw IllegalArgumentException("Unknown permission")
   }
   openSettings(intent)
   promise.resolve(null)
  } catch (error: Exception) { promise.reject("PERMISSION_SETTINGS_OPEN_FAILED", "권한 설정을 열지 못했어요.", error) }
 }
 @ReactMethod fun openFullScreenIntentSettings(promise: Promise) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { promise.resolve(null); return }
  try {
   val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
   openSettings(intent)
   promise.resolve(null)
  } catch (error: Exception) { promise.reject("FULL_SCREEN_SETTINGS_OPEN_FAILED", "전체 화면 알림 설정을 열지 못했어요.", error) }
 }
 @ReactMethod fun scheduleTestAlarm(delayMilliseconds: Double, promise: Promise) {
  val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { promise.reject("NOTIFICATIONS_NOT_ALLOWED", "알림 권한을 먼저 허용해 주세요."); return }
  if (!notificationManager.areNotificationsEnabled()) { promise.reject("NOTIFICATIONS_NOT_ALLOWED", "알림을 먼저 허용해 주세요."); return }
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) { promise.reject("EXACT_ALARM_NOT_ALLOWED", "정확 알람 권한이 꺼져 있어요."); return }
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && !notificationManager.canUseFullScreenIntent()) { promise.reject("FULL_SCREEN_INTENT_NOT_ALLOWED", "전체 화면 알림을 먼저 허용해 주세요."); return }
  if (!(context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)) { promise.reject("BATTERY_OPTIMIZATION_NOT_ALLOWED", "배터리 최적화 예외를 먼저 허용해 주세요."); return }
  val triggerAt = System.currentTimeMillis() + delayMilliseconds.toLong()
  val intent = Intent(context, AlarmReceiver::class.java)
  val operation = PendingIntent.getBroadcast(context, 8108, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val showIntent = PendingIntent.getActivity(context, 8107, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  manager.cancel(operation); manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showIntent), operation)
  promise.resolve(Arguments.createMap().apply { putDouble("triggerAt", triggerAt.toDouble()) })
 }
 private fun openSettings(intent: Intent) {
  val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
  val target = if (intent.resolveActivity(context.packageManager) != null) intent else fallback
  val activity = context.currentActivity
  if (activity != null) activity.startActivity(target) else context.startActivity(target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
 }
}
