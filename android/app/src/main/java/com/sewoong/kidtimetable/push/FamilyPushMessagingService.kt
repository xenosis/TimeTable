package com.sewoong.kidtimetable.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import com.sewoong.kidtimetable.MainActivity
import com.sewoong.kidtimetable.R
import com.sewoong.kidtimetable.alarm.RollingAlarmScheduler
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/** 데이터 수신은 네이티브에서 가족을 검증한 다음 보이는 알림으로 만든다. JS 실행을 기다리지 않는다. */
class FamilyPushMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val family = FamilyPushPolicy.messageFamily(message.data) ?: return
    val order = FamilyPushPolicy.messageOrder(message.data) ?: return
    synchronized(FamilyPushPolicy) {
      if (!FamilyPushPolicy.shouldShow(FamilyPushPolicy.family(this), family, RollingAlarmScheduler.childAlarmsSuppressed(this))) return
      if (!FamilyPushPolicy.isNewer(order, FamilyPushPolicy.previousOrder(this, family))) return
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (!manager.areNotificationsEnabled()) return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel("family-changes", "시간표 변경", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val intent = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
        .setData(Uri.parse("kidtimetable://push-change?familyId=${Uri.encode(family)}"))
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      val open = PendingIntent.getActivity(this, FamilyPushPolicy.ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      manager.notify(FamilyPushPolicy.TAG, FamilyPushPolicy.ID, NotificationCompat.Builder(this, "family-changes")
        .setSmallIcon(R.drawable.notification_icon).setContentTitle("시간표가 바뀌었어요")
        .setContentText("눌러서 새로운 시간표와 할 일을 확인해요.").setContentIntent(open).setAutoCancel(true).build())
      FamilyPushPolicy.rememberOrder(this, family, order)
    }
  }
}
