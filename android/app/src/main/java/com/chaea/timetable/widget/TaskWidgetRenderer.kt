package com.chaea.timetable.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.chaea.timetable.R

/**
 * TaskView(무엇을 보일지)를 RemoteViews(어떻게 그릴지)로 옮긴다. 할 일 줄은 TaskListService가 스크롤 목록 항목으로 만들고,
 * 줄을 누를 때마다 완료와 미완료가 번갈아 바뀐다(WidgetTaskToggleReceiver). 제목·빈 곳을 누르면 앱이 열린다.
 */
object TaskWidgetRenderer {
  private const val OPEN_APP_REQUEST_CODE = 5506
  private const val TOGGLE_TEMPLATE_REQUEST_CODE = 6100

  /** 목록 줄이 채워 보낼 토글 브로드캐스트. 줄마다 할 일·날짜를 채우므로 mutable이어야 한다(안드로이드 12+ 목록 템플릿 규칙). */
  private fun toggleTemplate(context: Context): PendingIntent =
    PendingIntent.getBroadcast(context, TOGGLE_TEMPLATE_REQUEST_CODE, Intent(context, WidgetTaskToggleReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)

  fun render(context: Context, widgetId: Int, view: TaskView, theme: WidgetTheme?): RemoteViews {
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
      // 모두 끝내도 목록은 그대로 보여 잘못 눌렀을 때 다시 눌러 되돌릴 수 있다
      setViewVisibility(R.id.task_list, if (view.rows.isEmpty()) View.GONE else View.VISIBLE)
      setRemoteAdapter(R.id.task_list, WidgetRenderSupport.listServiceIntent(context, TaskListService::class.java, widgetId))
      setPendingIntentTemplate(R.id.task_list, toggleTemplate(context))

      if (view.moreCount > 0) {
        setViewVisibility(R.id.task_more, View.VISIBLE)
        setTextViewText(R.id.task_more, "+ ${view.moreCount}개")
        setTextColor(R.id.task_more, muted)
      } else setViewVisibility(R.id.task_more, View.GONE)
    }
  }
}
