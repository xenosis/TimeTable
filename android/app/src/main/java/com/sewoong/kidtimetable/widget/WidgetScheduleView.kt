package com.sewoong.kidtimetable.widget

import java.util.Calendar

enum class RowState { PAST, CURRENT, UPCOMING }

data class ScheduleRow(
  val time: String,
  val title: String,
  val state: RowState,
  /** 과목 표식 색(#RRGGBB) */
  val markerColor: String,
)

/** '오늘 일정' 위젯이 그릴 내용. 안드로이드 API를 쓰지 않아 JUnit으로 검증한다. */
data class ScheduleView(
  /** 예: "오늘 수요일" */
  val heading: String,
  val rows: List<ScheduleRow>,
  /** 화면에 못 담은 개수(줄이 모자라 뺀 것 + 앱이 상한 때문에 못 담은 것). 0보다 크면 "+N개"로 알린다 */
  val moreCount: Int,
  /** 보여줄 일정이 없을 때의 상태 문구. null이면 rows를 그린다 */
  val message: String?,
)

object WidgetScheduleView {
  const val NO_AFTER_SCHOOL_MESSAGE = "오늘은 수업 뒤 일정이 없어요"
  const val MIN_ROWS = 2
  const val MAX_ROWS = 7

  private const val TITLE_AREA_DP = 44 // 위젯 여백 + 제목 줄
  private const val ROW_DP = 26 // 15sp 한글 한 줄(약 22dp) + 위아래 여백

  private val WEEKDAY_NAMES = listOf("일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일")

  /**
   * 위젯 높이(dp)에 글자가 잘리지 않고 들어가는 줄 수(제목 줄 제외, "+N개" 줄 포함).
   * 4x2(약 110dp)에서는 2줄, 높이에 따라 최대 7줄이다(딸 폰 4x2는 기본 높이가 커서 더 많이 들어간다).
   */
  fun capacityFor(heightDp: Int, fontScale: Float = 1f): Int {
    val scale = fontScale.coerceAtLeast(1f) // 글자 크기 설정이 크면 줄도 그만큼 높아진다
    return ((heightDp - TITLE_AREA_DP * scale) / (ROW_DP * scale)).toInt().coerceIn(MIN_ROWS, MAX_ROWS)
  }

  fun heading(date: String): String {
    val parts = date.split('-').mapNotNull { it.toIntOrNull() }
    if (parts.size != 3) return "오늘"
    val weekday = Calendar.getInstance().apply { set(parts[0], parts[1] - 1, parts[2]) }.get(Calendar.DAY_OF_WEEK) - 1
    return "오늘 ${WEEKDAY_NAMES[weekday]}"
  }

  fun build(snapshot: WidgetSnapshot?, today: String, nowTime: String, capacity: Int): ScheduleView {
    val day = WidgetDayResolver.dayFor(snapshot, today)
      ?: return ScheduleView("오늘", emptyList(), 0, WidgetDayResolver.STALE_MESSAGE)
    val heading = heading(day.date)
    val ordered = day.schedule.sortedBy { it.startTime }
    if (ordered.isEmpty()) {
      val text = if (day.hiddenScheduleCount > 0) null else if (day.hasSchool) NO_AFTER_SCHOOL_MESSAGE else WidgetDayResolver.NO_SCHEDULE_MESSAGE
      return ScheduleView(heading, emptyList(), day.hiddenScheduleCount, text)
    }
    val lines = capacity.coerceIn(MIN_ROWS, MAX_ROWS)
    // 다 담을 수 있으면 그대로, 아니면 "+N개" 줄을 위해 한 줄을 비운다
    val needMore = ordered.size > lines || day.hiddenScheduleCount > 0
    val maxRows = if (ordered.size + (if (needMore) 1 else 0) <= lines) ordered.size else lines - 1
    // 넘칠 때는 이미 끝난 일정부터 빼서, 지금 진행 중이거나 다가올 일정이 보이게 한다
    val firstActive = ordered.indexOfFirst { it.endTime > nowTime }.let { if (it < 0) ordered.size - 1 else it }
    val start = minOf(firstActive, ordered.size - maxRows).coerceAtLeast(0)
    val shown = ordered.subList(start, start + maxRows)
    val rows = shown.map { entry ->
      val state = when {
        entry.endTime <= nowTime -> RowState.PAST
        entry.startTime <= nowTime -> RowState.CURRENT
        else -> RowState.UPCOMING
      }
      ScheduleRow(entry.startTime, entry.title, state, entry.backgroundColor)
    }
    return ScheduleView(heading, rows, ordered.size - shown.size + day.hiddenScheduleCount, null)
  }
}
