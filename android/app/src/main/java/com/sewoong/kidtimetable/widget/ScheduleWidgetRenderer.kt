package com.sewoong.kidtimetable.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.sewoong.kidtimetable.R

/** ScheduleView(무엇을 보일지)를 RemoteViews(어떻게 그릴지)로 옮긴다. */
object ScheduleWidgetRenderer {
  private val ROWS = arrayOf(
    intArrayOf(R.id.widget_row_1, R.id.widget_marker_1, R.id.widget_time_1, R.id.widget_title_1),
    intArrayOf(R.id.widget_row_2, R.id.widget_marker_2, R.id.widget_time_2, R.id.widget_title_2),
    intArrayOf(R.id.widget_row_3, R.id.widget_marker_3, R.id.widget_time_3, R.id.widget_title_3),
    intArrayOf(R.id.widget_row_4, R.id.widget_marker_4, R.id.widget_time_4, R.id.widget_title_4),
    intArrayOf(R.id.widget_row_5, R.id.widget_marker_5, R.id.widget_time_5, R.id.widget_title_5),
  )
  private const val OPEN_APP_REQUEST_CODE = 5505

  fun render(context: Context, view: ScheduleView, theme: WidgetTheme?): RemoteViews {
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
      } else setViewVisibility(R.id.widget_message, View.GONE)

      ROWS.forEachIndexed { index, ids ->
        val row = view.rows.getOrNull(index)
        if (row == null) { setViewVisibility(ids[0], View.GONE); return@forEachIndexed }
        val marker = WidgetRenderSupport.color(row.markerColor, WidgetRenderSupport.DEFAULT_MUTED)
        val past = row.state == RowState.PAST
        val rowText = if (past) WidgetRenderSupport.withAlpha(muted, 0xAA) else text
        setViewVisibility(ids[0], View.VISIBLE)
        // 진행 중인 일정은 과목 색을 옅게 깐 배경으로 강조하고, 끝난 일정은 글자와 표식을 흐리게 한다
        setInt(ids[0], "setBackgroundColor", if (row.state == RowState.CURRENT) WidgetRenderSupport.withAlpha(marker, 0x40) else 0)
        setInt(ids[1], "setBackgroundColor", if (past) WidgetRenderSupport.withAlpha(marker, 0x66) else marker)
        setTextViewText(ids[2], row.time); setTextColor(ids[2], rowText)
        setTextViewText(ids[3], row.title); setTextColor(ids[3], rowText)
      }

      if (view.moreCount > 0 && view.message == null) {
        setViewVisibility(R.id.widget_more, View.VISIBLE)
        setTextViewText(R.id.widget_more, "+ ${view.moreCount}개")
        setTextColor(R.id.widget_more, muted)
      } else setViewVisibility(R.id.widget_more, View.GONE)
    }
  }
}
