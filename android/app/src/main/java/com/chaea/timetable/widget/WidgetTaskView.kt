package com.chaea.timetable.widget

data class TaskRow(val id: Int, val title: String, val completed: Boolean)

/** '오늘 할 일' 위젯이 그릴 내용. 안드로이드 API를 쓰지 않아 JUnit으로 검증한다. */
data class TaskView(
  /** 이 화면이 그리는 날짜(yyyy-MM-dd). 줄을 눌렀을 때 그 날짜의 체크로 기록한다 */
  val date: String,
  /** 예: "오늘 할 일 1/3" */
  val heading: String,
  /** 오늘 할 일 전체(원래 순서). 위젯은 스크롤 목록이라 줄이 빠지거나 움직이지 않고, 누른 줄은 그 자리에서 체크만 바뀐다 */
  val rows: List<TaskRow>,
  /** 앱이 하루 상한 때문에 위젯 데이터에 못 담은 개수. 0보다 크면 "+N개"로 알린다 */
  val moreCount: Int,
  /** 할 일이 없을 때 또는 모두 끝냈을 때의 문구(모두 끝내도 목록은 그대로 보여 다시 눌러 되돌릴 수 있다). 없으면 null */
  val message: String?,
)

object WidgetTaskView {
  const val NO_TASKS_MESSAGE = "오늘 할 일이 없어요"
  const val ALL_DONE_MESSAGE = "오늘 할 일을 다 했어!"

  fun build(snapshot: WidgetSnapshot?, today: String): TaskView {
    val day = WidgetDayResolver.dayFor(snapshot, today)
      ?: return TaskView(today, "오늘 할 일", emptyList(), 0, WidgetDayResolver.STALE_MESSAGE)
    val tasks = day.tasks
    if (tasks.isEmpty() && day.hiddenTaskCount == 0) return TaskView(day.date, "오늘 할 일", emptyList(), 0, NO_TASKS_MESSAGE)
    val done = tasks.count { it.completed }
    // 앱이 상한 때문에 못 담은 할 일이 있으면 완료 여부를 알 수 없어 '다 했다'고 하지 않고 개수도 세지 않는다
    val complete = day.hiddenTaskCount == 0
    val heading = if (complete) "오늘 할 일 $done/${tasks.size}" else "오늘 할 일"
    val message = if (complete && done == tasks.size) ALL_DONE_MESSAGE else null
    return TaskView(day.date, heading, tasks.map { TaskRow(it.id, it.title, it.completed) }, day.hiddenTaskCount, message)
  }
}
