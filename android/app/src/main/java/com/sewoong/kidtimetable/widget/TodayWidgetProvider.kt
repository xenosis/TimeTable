package com.sewoong.kidtimetable.widget
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.sewoong.kidtimetable.R
import java.util.Date

class TodayWidgetProvider : AppWidgetProvider() {
  private fun views(context: Context, text: String) = RemoteViews(context.packageName, R.layout.today_widget).apply {
    setTextViewText(R.id.widget_current, text)
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kidtimetable://"), context, Class.forName("com.sewoong.kidtimetable.MainActivity"))
    val pending = PendingIntent.getActivity(context, 5505, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    setOnClickPendingIntent(R.id.widget_root, pending); setOnClickPendingIntent(R.id.widget_current, pending)
  }
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    // 저장된 7일치에서 기기 로컬 '오늘'의 항목을 골라 쓴다. 앱을 열지 않아도 날짜가 바뀌면 새 날짜 일정이 나온다.
    val snapshot = WidgetDataStore.readSnapshot(context)
    val now = Date() // 날짜와 시각을 같은 순간에서 만들어 자정 경계에서 어긋나지 않게 한다
    val text = WidgetDayResolver.singleLine(snapshot, WidgetClock.today(now), WidgetClock.time(now))
    // 위젯을 새로 올렸거나 알람이 사라졌어도 그릴 때마다 다음 갱신이 다시 예약된다
    runCatching { WidgetRefreshScheduler.scheduleNext(context, snapshot) }
    ids.forEach { manager.updateAppWidget(it, views(context, text)) }
  }
}
