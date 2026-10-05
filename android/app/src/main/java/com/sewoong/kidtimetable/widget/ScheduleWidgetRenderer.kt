package com.sewoong.kidtimetable.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.sewoong.kidtimetable.R

/** ScheduleView(무엇을 보일지)를 RemoteViews(어떻게 그릴지)로 옮긴다. 일정 줄은 TodayListService가 스크롤 목록 항목으로 만든다. */
object ScheduleWidgetRenderer {
  private const val OPEN_APP_REQUEST_CODE = 5505
  private const val OPEN_APP_TEMPLATE_REQUEST_CODE = 5508

  fun render(context: Context, widgetId: Int, view: ScheduleView, theme: WidgetTheme?): RemoteViews {
    val background = WidgetRenderSupport.color(theme?.background, WidgetRenderSupport.DEFAULT_BACKGROUND)
    val text = WidgetRenderSupport.color(theme?.text, WidgetRenderSupport.DEFAULT_TEXT)
    val muted = WidgetRenderSupport.color(theme?.textMuted, WidgetRenderSupport.DEFAULT_MUTED)
    return RemoteViews(context.packageName, R.layout.today_widget).apply {
      setInt(R.id.widget_root, "setBackgroundColor", background)
      setTextViewText(R.id.widget_title, view.heading)
      setTextColor(R.id.widget_title, text)
      setOnClickPendingIntent(R.id.widget_root, WidgetRenderSupport.openAppIntent(context, OPEN_APP_REQUEST_CODE))

      if (view.message != null) {
        setViewVisibility(R.id.widget_message, View.VISIBLE)
        setTextViewText(R.id.widget_message, view.message)
        setTextColor(R.id.widget_message, muted)
        setViewVisibility(R.id.widget_list, View.GONE)
      } else {
        setViewVisibility(R.id.widget_message, View.GONE)
        setViewVisibility(R.id.widget_list, View.VISIBLE)
      }
      setRemoteAdapter(R.id.widget_list, WidgetRenderSupport.listServiceIntent(context, TodayListService::class.java, widgetId))
      // 목록 줄을 누르면 앱 오늘 화면으로 간다(줄마다 빈 fill-in을 채워 이 템플릿을 쓴다)
      setPendingIntentTemplate(R.id.widget_list, WidgetRenderSupport.openAppTemplate(context, OPEN_APP_TEMPLATE_REQUEST_CODE))

      if (view.moreCount > 0 && view.message == null) {
        setViewVisibility(R.id.widget_more, View.VISIBLE)
        setTextViewText(R.id.widget_more, "+ ${view.moreCount}개")
        setTextColor(R.id.widget_more, muted)
      } else setViewVisibility(R.id.widget_more, View.GONE)
    }
  }
}
