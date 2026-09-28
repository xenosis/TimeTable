package com.sewoong.kidtimetable.widget
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.sewoong.kidtimetable.R
class TodayWidgetProvider : AppWidgetProvider() {
  private fun views(context: Context, text: String) = RemoteViews(context.packageName, R.layout.today_widget).apply {
    setTextViewText(R.id.widget_current, text)
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kidtimetable://"), context, Class.forName("com.sewoong.kidtimetable.MainActivity"))
    val pending = PendingIntent.getActivity(context, 5505, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    setOnClickPendingIntent(R.id.widget_root, pending); setOnClickPendingIntent(R.id.widget_current, pending)
  }
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = WidgetDataStore.read(context); val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
    val text = if (data == null || data.optString("scheduleDate") != today) "앱을 열어 새로고침해 줘" else {
      val now = java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).format(java.util.Date()); val items = data.optJSONArray("schedule") ?: org.json.JSONArray()
      val current = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.firstOrNull { it.optString("startTime") <= now && now < it.optString("endTime") }
      val next = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.filter { it.optString("startTime") > now }.minByOrNull { it.optString("startTime") }
      listOf(current?.optString("startTime") ?: next?.optString("startTime").orEmpty(), when { current != null -> current.optString("title"); next != null -> "지금은 쉬는 시간이야 · 다음 ${next.optString("title")}"; else -> "오늘 일정이 없어요" }).filter { it.isNotBlank() }.joinToString(" ")
    }; ids.forEach { manager.updateAppWidget(it, views(context, text)) }
  }
}

