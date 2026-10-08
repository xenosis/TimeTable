package com.chaea.timetable.widget

import java.util.Calendar
import java.util.TimeZone

/** 지금 이 순간 위젯이 무엇을 보여줄지 정하는 순수 계산. 안드로이드 API를 쓰지 않는다. */
object WidgetDayResolver {
  const val STALE_MESSAGE = "앱을 열어 새로고침해 줘"
  const val NO_SCHEDULE_MESSAGE = "오늘 일정이 없어요"

  data class Status(val current: WidgetScheduleEntry?, val next: WidgetScheduleEntry?)

  /**
   * 데이터의 date 문자열을 기기 로컬 오늘(today, yyyy-MM-dd)과 그대로 비교한다.
   * UTC로 바꿔 비교하면 한국 시간 00~09시에 하루가 어긋나므로 updatedAt에서 날짜를 만들지 않는다.
   * 오늘이 없으면(7일이 지났거나 읽기 실패) null을 돌려주고, 이전 날짜의 일정을 새 정보처럼 보이지 않는다.
   */
  fun dayFor(snapshot: WidgetSnapshot?, today: String): WidgetDay? = snapshot?.days?.firstOrNull { it.date == today }

  fun status(day: WidgetDay, nowTime: String): Status {
    val ordered = day.schedule.sortedBy { it.startTime }
    val current = ordered.firstOrNull { it.startTime <= nowTime && nowTime < it.endTime }
    val next = ordered.firstOrNull { it.startTime > nowTime }
    return Status(current, next)
  }

  /** 한 줄 위젯에 보일 문구. 레이아웃이 바뀌기 전까지의 표시 규칙이다. */
  fun singleLine(snapshot: WidgetSnapshot?, today: String, nowTime: String): String {
    val day = dayFor(snapshot, today) ?: return STALE_MESSAGE
    val status = status(day, nowTime)
    val text = when {
      status.current != null -> status.current.title
      status.next != null -> "지금은 쉬는 시간이야 · 다음 ${status.next.title}"
      else -> return NO_SCHEDULE_MESSAGE
    }
    val time = status.current?.startTime ?: status.next?.startTime.orEmpty()
    return listOf(time, text).filter { it.isNotBlank() }.joinToString(" ")
  }

  /** 오늘 일정의 시작·끝 시각 중 지금 이후 가장 가까운 시각(분). 없으면 null. */
  fun nextBoundaryMinutes(day: WidgetDay?, nowMinutes: Int): Int? {
    if (day == null) return null
    return day.schedule.flatMap { listOf(it.startTime, it.endTime) }
      .mapNotNull { toMinutes(it) }
      .filter { it > nowMinutes }
      .minOrNull()
  }

  /** yyyy-MM-dd. 앱이 쓰는 기기 로컬 날짜와 같은 기준이다. */
  fun dateString(calendar: Calendar): String = "%04d-%02d-%02d".format(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH))

  /**
   * 위젯을 다시 그릴 다음 시각(epoch millis).
   * 오늘 일정의 다음 시작·끝 시각과 '자정 직후(00:00:01)' 중 빠른 쪽이다. 자정 갱신은 다음 날 항목으로 넘어가기 위한 것이다.
   */
  fun nextRefreshAtMillis(nowMillis: Long, timeZone: TimeZone, snapshot: WidgetSnapshot?): Long {
    val now = Calendar.getInstance(timeZone).apply { timeInMillis = nowMillis }
    val midnight = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 1); set(Calendar.MILLISECOND, 0) }.timeInMillis
    val nowMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    val boundary = nextBoundaryMinutes(dayFor(snapshot, dateString(now)), nowMinutes) ?: return midnight
    val candidate = (now.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, boundary / 60); set(Calendar.MINUTE, boundary % 60); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
    return if (candidate > nowMillis && candidate < midnight) candidate else midnight
  }

  fun toMinutes(time: String): Int? {
    val parts = time.split(':').mapNotNull { it.toIntOrNull() }
    return if (parts.size == 2 && parts[0] in 0..23 && parts[1] in 0..59) parts[0] * 60 + parts[1] else null
  }
}
