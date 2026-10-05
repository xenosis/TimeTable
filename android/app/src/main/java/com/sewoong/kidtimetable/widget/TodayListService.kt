package com.sewoong.kidtimetable.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.sewoong.kidtimetable.R
import java.util.Date

/** 오늘 일정 위젯의 스크롤 목록 항목을 만든다. 위젯 크기만큼 보이고 나머지는 위젯 안에서 올려 본다. */
class TodayListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TodayListFactory(applicationContext)
}

private class TodayListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var view: ScheduleView? = null
  private var theme: WidgetTheme? = null

  override fun onCreate() = Unit
  override fun onDestroy() = Unit

  /** 위젯이 다시 그려질 때마다 저장된 데이터와 지금 시각으로 목록을 새로 만든다(진행 중·지난 일정 표시가 시각에 따라 바뀐다). */
  override fun onDataSetChanged() {
    val snapshot = WidgetDataStore.readSnapshot(context)
    val now = Date()
    view = WidgetScheduleView.build(snapshot, WidgetClock.today(now), WidgetClock.time(now))
    theme = snapshot?.theme
  }

  override fun getCount(): Int = view?.takeIf { it.message == null }?.rows?.size ?: 0

  override fun getViewAt(position: Int): RemoteViews {
    val row = view?.rows?.getOrNull(position) ?: return RemoteViews(context.packageName, R.layout.today_widget_item)
    val text = WidgetRenderSupport.color(theme?.text, WidgetRenderSupport.DEFAULT_TEXT)
    val muted = WidgetRenderSupport.color(theme?.textMuted, WidgetRenderSupport.DEFAULT_MUTED)
    val marker = WidgetRenderSupport.color(row.markerColor, WidgetRenderSupport.DEFAULT_MUTED)
    val past = row.state == RowState.PAST
    val rowText = if (past) WidgetRenderSupport.withAlpha(muted, 0xAA) else text
    return RemoteViews(context.packageName, R.layout.today_widget_item).apply {
      // 진행 중인 일정은 과목 색을 옅게 깐 배경으로 강조하고, 끝난 일정은 글자와 표식을 흐리게 한다
      setInt(R.id.widget_item_row, "setBackgroundColor", if (row.state == RowState.CURRENT) WidgetRenderSupport.withAlpha(marker, 0x40) else 0)
      setInt(R.id.widget_item_marker, "setBackgroundColor", if (past) WidgetRenderSupport.withAlpha(marker, 0x66) else marker)
      setTextViewText(R.id.widget_item_time, row.time); setTextColor(R.id.widget_item_time, rowText)
      setTextViewText(R.id.widget_item_title, row.title); setTextColor(R.id.widget_item_title, rowText)
      // 줄을 누르면 위젯 목록에 걸어 둔 '앱 열기'로 간다
      setOnClickFillInIntent(R.id.widget_item_row, Intent())
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = false
}
