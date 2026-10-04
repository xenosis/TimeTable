package com.sewoong.kidtimetable.widget

data class TaskRow(val id: Int, val title: String, val completed: Boolean)

/** '오늘 할 일' 위젯이 그릴 내용. 안드로이드 API를 쓰지 않아 JUnit으로 검증한다. */
data class TaskView(
  /** 이 화면이 그리는 날짜(yyyy-MM-dd). 줄을 눌렀을 때 그 날짜의 체크로 기록한다 */
  val date: String,
  /** 예: "오늘 할 일 1/3" */
  val heading: String,
  val rows: List<TaskRow>,
  /** 화면에 못 담은 개수(줄이 모자라 뺀 것 + 앱이 상한 때문에 못 담은 것). 0보다 크면 "+N개"로 알린다 */
  val moreCount: Int,
  /** 보여줄 할 일이 없거나 모두 끝냈을 때의 상태 문구. null이면 rows를 그린다 */
  val message: String?,
)

object WidgetTaskView {
  const val NO_TASKS_MESSAGE = "오늘 할 일이 없어요"
  const val ALL_DONE_MESSAGE = "오늘 할 일을 다 했어!"
  const val MIN_ROWS = 2
  const val MAX_ROWS = 4

  private const val TITLE_AREA_DP = 44
  private const val ROW_DP = 30

  /**
   * 위젯 높이(dp)에 글자가 잘리지 않고 들어가는 줄 수("+N개" 줄 포함).
   * 글자 크기 설정(fontScale)이 크면 줄이 그만큼 높아지므로 같은 비율로 줄 수를 줄인다.
   */
  fun capacityFor(heightDp: Int, fontScale: Float = 1f): Int {
    val scale = fontScale.coerceAtLeast(1f)
    return ((heightDp - TITLE_AREA_DP * scale) / (ROW_DP * scale)).toInt().coerceIn(MIN_ROWS, MAX_ROWS)
  }

  fun build(snapshot: WidgetSnapshot?, today: String, capacity: Int): TaskView {
    val day = WidgetDayResolver.dayFor(snapshot, today)
      ?: return TaskView(today, "오늘 할 일", emptyList(), 0, WidgetDayResolver.STALE_MESSAGE)
    val tasks = day.tasks
    if (tasks.isEmpty() && day.hiddenTaskCount == 0) return TaskView(day.date, "오늘 할 일", emptyList(), 0, NO_TASKS_MESSAGE)
    val done = tasks.count { it.completed }
    // 앱이 상한 때문에 못 담은 할 일이 있으면 완료 여부를 알 수 없어 '다 했다'고 하지 않고 개수도 세지 않는다
    val complete = day.hiddenTaskCount == 0
    val heading = if (complete) "오늘 할 일 $done/${tasks.size}" else "오늘 할 일"
    val lines = capacity.coerceIn(MIN_ROWS, MAX_ROWS)
    if (complete && done == tasks.size) {
      // 모두 끝내도 줄은 그대로 두어(취소선) 잘못 눌렀을 때 다시 눌러 되돌릴 수 있게 한다. 칭찬 문구가 한 줄을 쓴다
      val room = lines - 1
      // 작은 위젯에서도 최소 한 줄은 남겨, 모두 끝낸 뒤 잘못 눌렀을 때 다시 눌러 되돌릴 수 있게 한다
      val count = if (tasks.size <= room) tasks.size else maxOf(1, room - 1)
      return TaskView(day.date, heading, tasks.take(count).map { TaskRow(it.id, it.title, it.completed) }, tasks.size - count, ALL_DONE_MESSAGE)
    }
    val needMore = tasks.size > lines || day.hiddenTaskCount > 0
    val maxRows = if (tasks.size + (if (needMore) 1 else 0) <= lines) tasks.size else lines - 1
    // 줄이 모자라면 못 한 일을 먼저 남기고 끝낸 일을 뺀다(안 한 일이 잘려 나가지 않게). 보이는 줄은 원래 순서를 지켜,
    // 누르면 그 자리에서 체크 표시만 바뀌고 줄이 이동하지 않는다(연타하면 다른 할 일이 눌리는 일을 막는다).
    val kept = (tasks.indices.filter { !tasks[it].completed } + tasks.indices.filter { tasks[it].completed }).take(maxRows).sorted()
    val shown = kept.map { tasks[it] }
    return TaskView(day.date, heading, shown.map { TaskRow(it.id, it.title, it.completed) }, tasks.size - shown.size + day.hiddenTaskCount, null)
  }
}
