package com.sewoong.kidtimetable.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.sewoong.kidtimetable.R

/** TaskView(무엇을 보일지)를 RemoteViews(어떻게 그릴지)로 옮긴다. 못 한 일의 줄을 누르면 완료로 바뀌고(WidgetTaskToggleReceiver) 나머지 영역을 누르면 앱이 열린다. */
object TaskWidgetRenderer {
  private val ROWS = arrayOf(
    intArrayOf(R.id.task_row_1, R.id.task_box_1, R.id.task_title_1),
    intArrayOf(R.id.task_row_2, R.id.task_box_2, R.id.task_title_2),
    intArrayOf(R.id.task_row_3, R.id.task_box_3, R.id.task_title_3),
    intArrayOf(R.id.task_row_4, R.id.task_box_4, R.id.task_title_4),
  )
  private const val OPEN_APP_REQUEST_CODE = 5506
  private const val TOGGLE_REQUEST_CODE_BASE = 6100

  /** 줄마다 다른 요청 번호와 주소를 줘서 줄끼리 섞이지 않게 한다. 위젯을 그릴 때마다 새 내용으로 갱신된다. */
  private fun toggleIntent(context: Context, index: Int, taskId: Int, date: String): PendingIntent {
    val intent = Intent(context, WidgetTaskToggleReceiver::class.java)
      .setData(Uri.parse("kidtimetable-widget://toggle/$taskId/$date"))
      .putExtra(WidgetTaskToggleReceiver.EXTRA_TASK_ID, taskId)
      .putExtra(WidgetTaskToggleReceiver.EXTRA_DATE, date)
    return PendingIntent.getBroadcast(context, TOGGLE_REQUEST_CODE_BASE + index, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun render(context: Context, view: TaskView, theme: WidgetTheme?): RemoteViews {
    val background = WidgetRenderSupport.color(theme?.background, WidgetRenderSupport.DEFAULT_BACKGROUND)
    val text = WidgetRenderSupport.color(theme?.text, WidgetRenderSupport.DEFAULT_TEXT)
    val muted = WidgetRenderSupport.color(theme?.textMuted, WidgetRenderSupport.DEFAULT_MUTED)
    val primary = WidgetRenderSupport.color(theme?.primary, text)
    return RemoteViews(context.packageName, R.layout.task_widget).apply {
      setInt(R.id.task_root, "setBackgroundColor", background)
      setTextViewText(R.id.task_heading, view.heading)
      setTextColor(R.id.task_heading, text)
      setOnClickPendingIntent(R.id.task_root, WidgetRenderSupport.openAppIntent(context, OPEN_APP_REQUEST_CODE))

      if (view.message != null) {
        setViewVisibility(R.id.task_message, View.VISIBLE)
        setTextViewText(R.id.task_message, view.message)
        setTextColor(R.id.task_message, if (view.message == WidgetTaskView.ALL_DONE_MESSAGE) primary else muted)
      } else setViewVisibility(R.id.task_message, View.GONE)

      ROWS.forEachIndexed { index, ids ->
        val row = view.rows.getOrNull(index)
        if (row == null) { setViewVisibility(ids[0], View.GONE); return@forEachIndexed }
        setViewVisibility(ids[0], View.VISIBLE)
        // 끝낸 일은 체크 표시와 흐린 글자로, 아직 못 한 일은 빈 상자와 진한 글자로 보여준다
        val color = if (row.completed) WidgetRenderSupport.withAlpha(muted, 0xAA) else text
        setTextViewText(ids[1], if (row.completed) "☑" else "☐")
        setTextColor(ids[1], if (row.completed) color else primary)
        setTextViewText(ids[2], row.title)
        setTextColor(ids[2], color)
        // 못 한 일만 눌러서 완료한다. 끝낸 줄은 눌러도 앱이 열릴 뿐 바뀌지 않아, 잘못 눌러 완료가 취소되는 일이 없다
        // 줄에 이전에 걸어 둔 '완료' 동작이 남아 다른 할 일을 완료하지 않도록, 끝낸 줄에도 앱 열기를 명시해서 덮어쓴다
        setOnClickPendingIntent(ids[0], if (row.completed) WidgetRenderSupport.openAppIntent(context, OPEN_APP_REQUEST_CODE) else toggleIntent(context, index, row.id, view.date))
        setContentDescription(ids[0], if (row.completed) "${row.title}, 했어요" else "${row.title}, 아직 안 했어요. 누르면 했다고 표시해요")
      }

      if (view.moreCount > 0 && view.message == null) {
        setViewVisibility(R.id.task_more, View.VISIBLE)
        setTextViewText(R.id.task_more, "+ ${view.moreCount}개")
        setTextColor(R.id.task_more, muted)
      } else setViewVisibility(R.id.task_more, View.GONE)
    }
  }
}
