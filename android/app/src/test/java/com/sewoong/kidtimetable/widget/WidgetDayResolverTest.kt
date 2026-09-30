package com.sewoong.kidtimetable.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class WidgetDayResolverTest {
  private fun entry(title: String, start: String, end: String) = WidgetScheduleEntry(title, start, end, "#4F46E5", "#FFFFFF")

  private fun day(date: String, vararg entries: WidgetScheduleEntry) = WidgetDay(date, entries.toList(), emptyList(), 0, 0)

  private fun snapshot(vararg days: WidgetDay) = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", days.toList())

  @Test fun 오늘_날짜의_항목을_골라_쓴다() {
    val data = snapshot(day("2026-09-30", entry("오늘", "10:00", "11:00")), day("2026-10-01", entry("내일", "10:00", "11:00")))
    assertEquals("오늘", WidgetDayResolver.dayFor(data, "2026-09-30")?.schedule?.first()?.title)
    assertEquals("내일", WidgetDayResolver.dayFor(data, "2026-10-01")?.schedule?.first()?.title)
  }

  @Test fun 앱을_열지_않고_날짜가_바뀌어도_새_날짜를_고른다() {
    val data = snapshot(day("2026-09-30", entry("수요일", "10:00", "11:00")), day("2026-10-01", entry("목요일", "10:00", "11:00")))
    assertEquals("10:00 목요일", WidgetDayResolver.singleLine(data, "2026-10-01", "10:30"))
  }

  @Test fun 오늘이_데이터에_없으면_안내_문구만_보이고_옛_일정을_새_정보처럼_보이지_않는다() {
    val stale = snapshot(day("2026-09-28", entry("옛일정", "10:00", "11:00")), day("2026-09-29", entry("어제일정", "10:00", "11:00")))
    assertNull(WidgetDayResolver.dayFor(stale, "2026-09-30"))
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetDayResolver.singleLine(stale, "2026-09-30", "10:30"))
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetDayResolver.singleLine(null, "2026-09-30", "10:30"))
  }

  @Test fun 지금_진행_중인_일정과_다음_일정을_구분한다() {
    val today = day("2026-09-30", entry("앞", "09:00", "10:00"), entry("지금", "10:00", "11:00"), entry("뒤", "11:30", "12:00"))
    val status = WidgetDayResolver.status(today, "10:30")
    assertEquals("지금", status.current?.title)
    assertEquals("뒤", status.next?.title)
  }

  @Test fun 시작_시각은_포함하고_끝_시각은_포함하지_않는다() {
    val today = day("2026-09-30", entry("가", "10:00", "11:00"), entry("나", "11:00", "12:00"))
    assertEquals("가", WidgetDayResolver.status(today, "10:00").current?.title)
    assertEquals("나", WidgetDayResolver.status(today, "11:00").current?.title) // 11:00에는 가가 끝나고 나가 시작한다
    assertNull(WidgetDayResolver.status(today, "12:00").current)
  }

  @Test fun 쉬는_시간에는_다음_일정을_안내한다() {
    val data = snapshot(day("2026-09-30", entry("앞일정", "09:00", "10:00"), entry("뒤일정", "11:30", "12:00")))
    assertEquals("11:30 지금은 쉬는 시간이야 · 다음 뒤일정", WidgetDayResolver.singleLine(data, "2026-09-30", "10:30"))
  }

  @Test fun 일정이_다_끝났거나_없으면_없다고_알린다() {
    val ended = snapshot(day("2026-09-30", entry("끝난", "09:00", "10:00")))
    assertEquals(WidgetDayResolver.NO_SCHEDULE_MESSAGE, WidgetDayResolver.singleLine(ended, "2026-09-30", "15:00"))
    val empty = snapshot(day("2026-09-30"))
    assertEquals(WidgetDayResolver.NO_SCHEDULE_MESSAGE, WidgetDayResolver.singleLine(empty, "2026-09-30", "10:00"))
  }

  @Test fun 저장된_순서와_상관없이_시간순으로_계산한다() {
    val today = day("2026-09-30", entry("나중", "15:00", "16:00"), entry("먼저", "13:00", "14:00"))
    assertEquals("먼저", WidgetDayResolver.status(today, "12:00").next?.title)
  }

  @Test fun 다음_갱신_시각은_지금_이후_가장_가까운_시작_또는_끝이다() {
    val today = day("2026-09-30", entry("가", "10:00", "11:00"), entry("나", "13:10", "14:00"))
    assertEquals(11 * 60, WidgetDayResolver.nextBoundaryMinutes(today, 10 * 60 + 30)) // 진행 중이면 그 일정의 끝
    assertEquals(13 * 60 + 10, WidgetDayResolver.nextBoundaryMinutes(today, 12 * 60)) // 쉬는 시간이면 다음 시작
    assertNull(WidgetDayResolver.nextBoundaryMinutes(today, 15 * 60)) // 더 없으면 자정 갱신에 맡긴다
    assertNull(WidgetDayResolver.nextBoundaryMinutes(null, 10 * 60))
  }

  @Test fun 시각_문자열이_이상하면_무시한다() {
    assertNull(WidgetDayResolver.toMinutes("25:00"))
    assertNull(WidgetDayResolver.toMinutes("abc"))
    assertNull(WidgetDayResolver.toMinutes(""))
    assertEquals(9 * 60 + 5, WidgetDayResolver.toMinutes("09:05"))
  }

  // ---- 파서 ----

  @Test fun v2_JSON을_읽어_7일치와_숨긴_개수를_얻는다() {
    val payload = """
      {"schemaVersion":2,"updatedAt":"2026-09-30T01:00:00.000Z","timetableName":"평소","theme":{},
       "days":[{"date":"2026-09-30","weekday":3,
         "schedule":[{"title":"피아노","startTime":"17:10","endTime":"18:10","backgroundColor":"#DB2777","textColor":"#FFFFFF"}],
         "tasks":[{"id":7,"title":"숙제","completed":true}],
         "hiddenScheduleCount":2,"hiddenTaskCount":3}]}
    """.trimIndent()
    val parsed = WidgetSnapshotParser.parse(payload)
    assertNotNull(parsed)
    assertEquals("평소", parsed!!.timetableName)
    val today = parsed.days.single()
    assertEquals("피아노", today.schedule.single().title)
    assertEquals("#DB2777", today.schedule.single().backgroundColor)
    assertEquals(true, today.tasks.single().completed)
    assertEquals(2, today.hiddenScheduleCount)
    assertEquals(3, today.hiddenTaskCount)
  }

  @Test fun 옛_v1_JSON도_오늘_하루짜리로_읽는다() {
    val payload = """{"schemaVersion":1,"updatedAt":"x","scheduleDate":"2026-09-30","schedule":[{"title":"옛수업","startTime":"10:00","endTime":"11:00"}]}"""
    val parsed = WidgetSnapshotParser.parse(payload)!!
    assertEquals("2026-09-30", parsed.days.single().date)
    assertEquals("10:00 옛수업", WidgetDayResolver.singleLine(parsed, "2026-09-30", "10:30"))
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetDayResolver.singleLine(parsed, "2026-10-01", "10:30")) // 다음 날에는 옛 v1을 쓰지 않는다
  }

  @Test fun 깨졌거나_모르는_버전의_데이터는_null이다() {
    assertNull(WidgetSnapshotParser.parse("이건 JSON이 아니다"))
    assertNull(WidgetSnapshotParser.parse("""{"schemaVersion":99,"days":[]}"""))
    assertNull(WidgetSnapshotParser.parse("""{"days":[]}"""))
    assertNull(WidgetSnapshotParser.parse(""))
  }

  @Test fun 일정_목록이_없는_날짜도_오류_없이_읽는다() {
    val parsed = WidgetSnapshotParser.parse("""{"schemaVersion":2,"days":[{"date":"2026-09-30"}]}""")!!
    assertEquals(emptyList<WidgetScheduleEntry>(), parsed.days.single().schedule)
    assertEquals(WidgetDayResolver.NO_SCHEDULE_MESSAGE, WidgetDayResolver.singleLine(parsed, "2026-09-30", "10:00"))
  }

  // ---- 갱신 시각 (서울 시간대로 고정해 실행 환경과 무관하게 같은 결과를 낸다) ----

  private val seoul: TimeZone = TimeZone.getTimeZone("Asia/Seoul")

  private fun millis(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int = 0): Long =
    Calendar.getInstance(seoul).apply { clear(); set(year, month - 1, day, hour, minute, second) }.timeInMillis

  private val wednesday = snapshot(day("2026-09-30", entry("가", "10:00", "11:00"), entry("나", "13:10", "14:00")))

  @Test fun 다음_시작_또는_끝_시각으로_갱신을_예약한다() {
    assertEquals(millis(2026, 9, 30, 11, 0), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 10, 30), seoul, wednesday)) // 진행 중이면 끝
    assertEquals(millis(2026, 9, 30, 13, 10), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 12, 0), seoul, wednesday)) // 쉬는 시간이면 다음 시작
    assertEquals(millis(2026, 9, 30, 10, 0), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 9, 0), seoul, wednesday))
  }

  @Test fun 마지막_일정_뒤에는_자정_직후로_예약한다() {
    assertEquals(millis(2026, 10, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 15, 0), seoul, wednesday))
    assertEquals(millis(2026, 10, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 23, 59), seoul, wednesday))
  }

  @Test fun 일정이_없는_날이나_데이터가_없어도_자정_직후로_예약한다() {
    assertEquals(millis(2026, 10, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 10, 0), seoul, snapshot(day("2026-09-30"))))
    assertEquals(millis(2026, 10, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 10, 0), seoul, null))
  }

  @Test fun 자정_직후에는_새_날짜의_첫_시각으로_예약한다() {
    val twoDays = snapshot(day("2026-09-30", entry("가", "10:00", "11:00")), day("2026-10-01", entry("다", "08:30", "09:00")))
    assertEquals(millis(2026, 10, 1, 8, 30), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 10, 1, 0, 0, 5), seoul, twoDays))
  }

  @Test fun 월말과_연말_경계에서도_다음_날_자정으로_넘어간다() {
    assertEquals(millis(2026, 10, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 9, 30, 23, 30), seoul, null))
    assertEquals(millis(2027, 1, 1, 0, 0, 1), WidgetDayResolver.nextRefreshAtMillis(millis(2026, 12, 31, 23, 30), seoul, null))
  }

  @Test fun 날짜_문자열은_앱이_쓰는_형식_그대로다() {
    assertEquals("2026-09-05", WidgetDayResolver.dateString(Calendar.getInstance(seoul).apply { clear(); set(2026, 8, 5) }))
    assertEquals("2026-12-31", WidgetDayResolver.dateString(Calendar.getInstance(seoul).apply { clear(); set(2026, 11, 31) }))
  }
}
