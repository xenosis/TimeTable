package com.chaea.timetable.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import com.chaea.timetable.MainActivity
import com.chaea.timetable.R
import com.chaea.timetable.alarm.RollingAlarmScheduler
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/** 데이터 수신은 네이티브에서 가족을 검증한 다음 보이는 알림으로 만든다. JS 실행을 기다리지 않는다. */
class FamilyPushMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val family = FamilyPushPolicy.messageFamily(message.data) ?: return
    val order = FamilyPushPolicy.messageOrder(message.data) ?: return
    val type = FamilyPushPolicy.messageType(message.data) ?: return
    val completion = type == "tasks-completed"
    if (completion && !FamilyPushPolicy.completionIsToday(FamilyPushPolicy.messageDate(message.data),
        java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString())) return
    val id = if (completion) FamilyPushPolicy.ID + 1 else FamilyPushPolicy.ID
    val channel = if (completion) "task-completions" else "family-changes"
    synchronized(FamilyPushPolicy) {
      if (!FamilyPushPolicy.shouldShow(FamilyPushPolicy.family(this), family, RollingAlarmScheduler.childAlarmsSuppressed(this), type)) return
      if (!FamilyPushPolicy.isNewer(order, FamilyPushPolicy.previousOrder(this, family, type))) return
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (!manager.areNotificationsEnabled()) return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(channel, if (completion) "할 일 완료" else "시간표 변경", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val intent = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
        .setData(Uri.parse("kidtimetable://push-change?familyId=${Uri.encode(family)}&type=${Uri.encode(type)}"))
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      val open = PendingIntent.getActivity(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      manager.notify(type, id, NotificationCompat.Builder(this, channel)
        .setSmallIcon(R.drawable.notification_icon).setContentTitle(if (completion) "딸이 할 일을 모두 했어요" else "시간표가 바뀌었어요")
        .setContentText(if (completion) "눌러서 오늘의 완료 현황을 확인해요." else "눌러서 새로운 시간표와 할 일을 확인해요.").setContentIntent(open).setAutoCancel(true).build())
      FamilyPushPolicy.rememberOrder(this, family, order, type)
    }
  }
}
