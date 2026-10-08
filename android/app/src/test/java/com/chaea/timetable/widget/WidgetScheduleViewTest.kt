package com.chaea.timetable.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetScheduleViewTest {
  private fun entry(title: String, start: String, end: String, color: String = "#4F46E5") = WidgetScheduleEntry(title, start, end, color, "#FFFFFF")

  private fun day(vararg entries: WidgetScheduleEntry, hidden: Int = 0, hasSchool: Boolean = false, date: String = "2026-09-30") =
    WidgetDay(date, entries.toList(), emptyList(), hidden, 0, hasSchool)

  private fun snapshot(day: WidgetDay) = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day))

  private fun build(day: WidgetDay, now: String) = WidgetScheduleView.build(snapshot(day), day.date, now)

  @Test fun 제목에_요일만_나온다() {
    assertEquals("수요일", WidgetScheduleView.heading("2026-09-30"))
    assertEquals("일요일", WidgetScheduleView.heading("2026-10-04"))
    assertEquals("토요일", WidgetScheduleView.heading("2026-10-03"))
    assertEquals("오늘", WidgetScheduleView.heading("잘못된 날짜"))
  }

  @Test fun 일정을_시작_시각_순으로_보여주고_진행_중은_강조_끝난_것은_흐리게_구분한다() {
    val view = build(day(entry("피아노", "16:00", "17:00"), entry("영어", "14:00", "15:00"), entry("수영", "15:30", "16:30"), entry("독서", "18:00", "18:30")), "16:10")
    assertEquals(listOf("영어", "수영", "피아노", "독서"), view.rows.map { it.title })
    assertEquals(listOf(RowState.PAST, RowState.CURRENT, RowState.CURRENT, RowState.UPCOMING), view.rows.map { it.state })
    assertNull(view.message)
    assertEquals(0, view.moreCount)
  }

  @Test fun 끝나는_시각_정각에는_지난_일정으로_보고_시작_시각_정각에는_진행_중으로_본다() {
    val view = build(day(entry("앞", "14:00", "15:00"), entry("뒤", "15:00", "16:00")), "15:00")
    assertEquals(listOf(RowState.PAST, RowState.CURRENT), view.rows.map { it.state })
  }

  @Test fun 과목_색이_줄마다_그대로_전달된다() {
    val view = build(day(entry("영어", "14:00", "15:00", "#D97706"), entry("수학", "15:00", "16:00", "#059669")), "13:00")
    assertEquals(listOf("#D97706", "#059669"), view.rows.map { it.markerColor })
  }

  @Test fun 끝난_일정은_바로_전_1개만_흐리게_남기고_지금과_다음_일정을_모두_목록에_담는다() {
    val schedule = (1..9).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "14:10") // 일정6(14:00~14:30)이 진행 중, 일정1~5는 끝남
    assertEquals(listOf("일정5", "일정6", "일정7", "일정8", "일정9"), view.rows.map { it.title })
    assertEquals(listOf(RowState.PAST, RowState.CURRENT, RowState.UPCOMING, RowState.UPCOMING, RowState.UPCOMING), view.rows.map { it.state })
    assertEquals(0, view.moreCount) // 줄을 빼서 숨기지 않으므로 '+ N개'가 없다
  }

  @Test fun 진행_중인_일정이_없으면_바로_전_일정과_다음_일정이_보인다() {
    val view = build(day(entry("앞", "09:00", "10:00"), entry("뒤", "15:00", "16:00")), "12:00")
    assertEquals(listOf("앞", "뒤"), view.rows.map { it.title })
    assertEquals(listOf(RowState.PAST, RowState.UPCOMING), view.rows.map { it.state })
  }

  @Test fun 아직_시작_전이면_끝난_일정_없이_모두_보인다() {
    val schedule = (1..7).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "07:00")
    assertEquals(7, view.rows.size)
    assertEquals(true, view.rows.none { it.state == RowState.PAST })
  }

  @Test fun 모두_끝난_날에는_마지막_일정_1개만_흐리게_남는다() {
    val schedule = (1..7).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "23:00")
    assertEquals(listOf("일정7"), view.rows.map { it.title })
    assertEquals(RowState.PAST, view.rows.single().state)
  }

  @Test fun 앱이_상한_때문에_못_담은_개수는_더보기로_센다() {
    val view = build(day(entry("일정", "14:00", "15:00"), hidden = 4), "13:00")
    assertEquals(1, view.rows.size)
    assertEquals(4, view.moreCount)
  }

  @Test fun 상태_문구가_경우마다_다르다() {
    assertEquals(WidgetScheduleView.NO_AFTER_SCHOOL_MESSAGE, build(day(hasSchool = true), "10:00").message)
    assertEquals(WidgetDayResolver.NO_SCHEDULE_MESSAGE, build(day(hasSchool = false), "10:00").message)
    val stale = WidgetScheduleView.build(snapshot(day(date = "2026-09-28")), "2026-09-30", "10:00")
    assertEquals(WidgetDayResolver.STALE_MESSAGE, stale.message)
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetScheduleView.build(null, "2026-09-30", "10:00").message)
  }

  @Test fun 일정이_있고_지난_일정만_있으면_문구_대신_지난_일정을_흐리게_보여준다() {
    val view = build(day(entry("영어", "09:00", "10:00")), "20:00")
    assertNull(view.message)
    assertEquals(RowState.PAST, view.rows.single().state)
  }
}
