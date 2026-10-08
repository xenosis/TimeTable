package com.chaea.timetable.widget

import android.content.Context
import android.content.Intent
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.chaea.timetable.R
import java.util.Date

/** 오늘 할 일 위젯의 스크롤 목록 항목을 만든다. 줄은 빠지거나 움직이지 않고, 누르면 그 자리에서 체크만 바뀐다. */
class TaskListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TaskListFactory(applicationContext)
}

private class TaskListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var view: TaskView? = null
  private var theme: WidgetTheme? = null

  override fun onCreate() = Unit
  override fun onDestroy() = Unit

  override fun onDataSetChanged() {
    val snapshot = WidgetDataStore.readSnapshot(context)
    view = WidgetTaskView.build(snapshot, WidgetClock.today(Date()))
    theme = snapshot?.theme
  }

  override fun getCount(): Int = view?.rows?.size ?: 0

  override fun getViewAt(position: Int): RemoteViews {
    val current = view
    val row = current?.rows?.getOrNull(position) ?: return RemoteViews(context.packageName, R.layout.task_widget_item)
    val text = WidgetRenderSupport.color(theme?.text, WidgetRenderSupport.DEFAULT_TEXT)
    val muted = WidgetRenderSupport.color(theme?.textMuted, WidgetRenderSupport.DEFAULT_MUTED)
    val primary = WidgetRenderSupport.color(theme?.primary, text)
    // 끝낸 일은 체크 표시와 흐린 글자·취소선으로, 아직 못 한 일은 빈 상자와 진한 글자로 보여준다
    // 끝낸 할 일은 흐린 글자색과 취소선·체크로 구분한다. 투명하게 하면 배경 대비가 4.5:1 아래로 떨어진다(P7.5 리뷰)
    val color = if (row.completed) muted else text
    return RemoteViews(context.packageName, R.layout.task_widget_item).apply {
      setTextViewText(R.id.task_item_box, if (row.completed) "☑" else "☐")
      setTextColor(R.id.task_item_box, if (row.completed) color else primary)
      setTextViewText(R.id.task_item_title, if (row.completed) SpannableString(row.title).apply { setSpan(StrikethroughSpan(), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) } else row.title)
      setTextColor(R.id.task_item_title, color)
      // 줄을 누를 때마다 완료와 미완료가 번갈아 바뀐다(목록에 걸어 둔 토글 브로드캐스트에 할 일·날짜를 채워 보낸다)
      setOnClickFillInIntent(R.id.task_item_row, Intent()
        .putExtra(WidgetTaskToggleReceiver.EXTRA_TASK_ID, row.id)
        .putExtra(WidgetTaskToggleReceiver.EXTRA_DATE, current.date))
      setContentDescription(R.id.task_item_row, if (row.completed) "${row.title}, 했어요. 누르면 아직 안 했다고 되돌려요" else "${row.title}, 아직 안 했어요. 누르면 했다고 표시해요")
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = view?.rows?.getOrNull(position)?.id?.toLong() ?: position.toLong()
  override fun hasStableIds(): Boolean = true
}
