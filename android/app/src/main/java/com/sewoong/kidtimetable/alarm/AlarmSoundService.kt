package com.sewoong.kidtimetable.alarm

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/** Owns the looping alarm sound in a foreground service so it plays even while the phone is
 * actively in use and Android only shows a heads-up banner instead of launching AlarmActivity. */
class AlarmSoundService : Service() {
  private var player: MediaPlayer? = null
  private val handler = Handler(Looper.getMainLooper())
  // 끄기 버튼·알람 화면이 막힌 상황(앱 일시정지 등)에서도 소리가 무한 반복되지 않게 하는 안전장치
  private val autoStop = Runnable { stopAlarm() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // START_STICKY로 시스템이 이 서비스를 null intent로 재시작하면 일정 정보 없이
    // "unknown" 알람이 다시 울린다. 재시작은 항상 AlarmReceiver(진짜 예약)를 통해서만 한다.
    if (intent == null) { stopSelf(); return START_NOT_STICKY }
    if (intent.action == ACTION_STOP) { stopAlarm(); return START_NOT_STICKY }
    val scheduleId = intent.getStringExtra("scheduleId") ?: "unknown"
    val title = intent.getStringExtra("title") ?: "할 일"
    TimeTableNotificationChannels.ensure(this)
    startForeground(AlarmReceiver.NOTIFICATION_ID, buildNotification(scheduleId, title))
    // 이미 다른 알람의 전체화면이 떠 있으면 마지막 일정으로 바꾼다(알림 갱신은 전체화면을 다시 띄우지 않는다)
    AlarmActivity.showLatestIfShowing(scheduleId, title)
    startSound()
    // 연속 알람이 오면 마지막 알람 기준으로 1분을 다시 센다
    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, MAX_RING_MILLIS)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
    stopSound()
    super.onDestroy()
  }

  private fun buildNotification(scheduleId: String, title: String): Notification {
    val stopIntent = PendingIntent.getService(
      this, 0, Intent(this, AlarmSoundService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val fullScreenIntent = PendingIntent.getActivity(
      this, 0,
      Intent(this, AlarmActivity::class.java)
        .setData(Uri.parse("kidtimetable://alarm/${Uri.encode(scheduleId)}"))
        .putExtra("scheduleId", scheduleId).putExtra("title", title)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val label = AlarmNavigation.displayTitle(scheduleId, isAlarm = true)
    return NotificationCompat.Builder(this, TimeTableNotificationChannels.ALARM_CHANNEL_ID)
      .setSmallIcon(com.sewoong.kidtimetable.R.drawable.notification_icon)
      .setContentTitle(label)
      .setContentText("$title 시간이에요.")
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      // 배너 본문을 눌러도 소리가 계속 나는 채로 앱만 열리면 헷갈린다. 전체화면과 같은
      // 화면(끄기/일정 보기)으로 보내 알람 상태를 항상 명확히 마주치게 한다.
      .setContentIntent(fullScreenIntent)
      .setFullScreenIntent(fullScreenIntent, true)
      .addAction(0, "끄기", stopIntent)
      .build()
  }

  private fun startSound() {
    if (player != null) return
    val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getValidRingtoneUri(this)
      ?: return
    player = try {
      MediaPlayer().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        isLooping = true
        setDataSource(this@AlarmSoundService, uri)
        prepare()
        start()
      }
    } catch (_: Exception) { null }
  }

  private fun stopSound() {
    try { player?.stop() } catch (_: Exception) { /* already stopped */ }
    player?.release()
    player = null
  }

  private fun stopAlarm() {
    stopSound()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    // 알림의 "끄기" 액션으로 껐을 때도 떠 있는 전체화면(AlarmActivity)을 함께 닫는다.
    AlarmActivity.finishIfShowing()
  }

  companion object {
    const val ACTION_STOP = "com.sewoong.kidtimetable.alarm.STOP"
    /** 알람 소리 최대 지속 시간(1분). 이후 소리와 알림을 자동으로 끈다. */
    const val MAX_RING_MILLIS = 60_000L

    fun start(context: android.content.Context, scheduleId: String, title: String) {
      val intent = Intent(context, AlarmSoundService::class.java).putExtra("scheduleId", scheduleId).putExtra("title", title)
      context.startForegroundService(intent)
    }

    fun stop(context: android.content.Context) {
      context.startService(Intent(context, AlarmSoundService::class.java).setAction(ACTION_STOP))
    }
  }
}
