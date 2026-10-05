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
  /** 바로 전에 끝난 일정 1개(흐리게)와 지금·다음 일정들(시간순). 위젯은 스크롤 목록이라 크기만큼 보이고 나머지는 위젯 안에서 올려 본다 */
  val rows: List<ScheduleRow>,
  /** 앱이 하루 상한 때문에 위젯 데이터에 못 담은 개수. 0보다 크면 "+N개"로 알린다 */
  val moreCount: Int,
  /** 보여줄 일정이 없을 때의 상태 문구. null이면 rows를 그린다 */
  val message: String?,
)

object WidgetScheduleView {
  const val NO_AFTER_SCHOOL_MESSAGE = "오늘은 수업 뒤 일정이 없어요"

  private val WEEKDAY_NAMES = listOf("일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일")

  fun heading(date: String): String {
    val parts = date.split('-').mapNotNull { it.toIntOrNull() }
    if (parts.size != 3) return "오늘"
    val weekday = Calendar.getInstance().apply { set(parts[0], parts[1] - 1, parts[2]) }.get(Calendar.DAY_OF_WEEK) - 1
    return "오늘 ${WEEKDAY_NAMES[weekday]}"
  }

  fun build(snapshot: WidgetSnapshot?, today: String, nowTime: String): ScheduleView {
    val day = WidgetDayResolver.dayFor(snapshot, today)
      ?: return ScheduleView("오늘", emptyList(), 0, WidgetDayResolver.STALE_MESSAGE)
    val heading = heading(day.date)
    val ordered = day.schedule.sortedBy { it.startTime }
    if (ordered.isEmpty()) {
      val text = if (day.hiddenScheduleCount > 0) null else if (day.hasSchool) NO_AFTER_SCHOOL_MESSAGE else WidgetDayResolver.NO_SCHEDULE_MESSAGE
      return ScheduleView(heading, emptyList(), day.hiddenScheduleCount, text)
    }
    val rows = ordered.map { entry ->
      val state = when {
        entry.endTime <= nowTime -> RowState.PAST
        entry.startTime <= nowTime -> RowState.CURRENT
        else -> RowState.UPCOMING
      }
      ScheduleRow(entry.startTime, entry.title, state, entry.backgroundColor)
    }
    // 끝난 일정은 바로 전 1개만 흐리게 남긴다(2026-10-05 사용자 결정). 목록이 늘 위에서 시작하므로 지금 일정이 맨 위 근처에 오고,
    // 스크롤 위치를 따로 맞추지 않아 갱신할 때 아이가 올려 둔 위치가 되돌아가지 않는다. 모두 끝난 날에는 마지막 일정 1개가 흐리게 남는다.
    val firstActive = rows.indexOfFirst { it.state != RowState.PAST }.let { if (it < 0) rows.size else it }
    return ScheduleView(heading, rows.drop(maxOf(0, firstActive - 1)), day.hiddenScheduleCount, null)
  }
}
