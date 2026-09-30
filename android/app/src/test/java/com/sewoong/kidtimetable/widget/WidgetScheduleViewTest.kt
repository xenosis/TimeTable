package com.sewoong.kidtimetable.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetScheduleViewTest {
  private fun entry(title: String, start: String, end: String, color: String = "#4F46E5") = WidgetScheduleEntry(title, start, end, color, "#FFFFFF")

  private fun day(vararg entries: WidgetScheduleEntry, hidden: Int = 0, hasSchool: Boolean = false, date: String = "2026-09-30") =
    WidgetDay(date, entries.toList(), emptyList(), hidden, 0, hasSchool)

  private fun snapshot(day: WidgetDay) = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day))

  private fun build(day: WidgetDay, now: String, capacity: Int = 5) = WidgetScheduleView.build(snapshot(day), day.date, now, capacity)

  @Test fun 제목에_오늘_요일이_나온다() {
    assertEquals("오늘 수요일", WidgetScheduleView.heading("2026-09-30"))
    assertEquals("오늘 일요일", WidgetScheduleView.heading("2026-10-04"))
    assertEquals("오늘 토요일", WidgetScheduleView.heading("2026-10-03"))
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

  @Test fun 줄이_모자라면_뒤를_빼고_더보기_개수를_센다() {
    val schedule = (1..7).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "08:00", capacity = 5)
    assertEquals(4, view.rows.size) // 5줄 중 한 줄은 '+N개' 자리
    assertEquals(3, view.moreCount)
    assertEquals("일정1", view.rows.first().title)
  }

  @Test fun 넘칠_때는_이미_끝난_일정부터_빼서_지금과_다음이_보이게_한다() {
    val schedule = (1..7).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "14:10", capacity = 5) // 일정6(14:00~14:30)이 진행 중
    assertEquals(listOf("일정6", "일정7"), view.rows.map { it.title }.takeLast(2))
    assertEquals(RowState.CURRENT, view.rows.first { it.title == "일정6" }.state)
    assertEquals(4, view.rows.size)
    assertEquals(3, view.moreCount)
  }

  @Test fun 모두_끝난_날에도_마지막_일정들이_흐리게_보인다() {
    val schedule = (1..7).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "23:00", capacity = 5)
    assertEquals("일정7", view.rows.last().title)
    assertEquals(true, view.rows.all { it.state == RowState.PAST })
  }

  @Test fun 앱이_상한_때문에_못_담은_개수도_더보기에_더한다() {
    val view = build(day(entry("일정", "14:00", "15:00"), hidden = 4), "13:00", capacity = 5)
    assertEquals(1, view.rows.size)
    assertEquals(4, view.moreCount)
  }

  @Test fun 딱_맞게_들어가면_더보기_줄을_만들지_않는다() {
    val schedule = (1..5).map { entry("일정$it", "%02d:00".format(8 + it), "%02d:30".format(8 + it)) }.toTypedArray()
    val view = build(day(*schedule), "08:00", capacity = 5)
    assertEquals(5, view.rows.size)
    assertEquals(0, view.moreCount)
  }

  @Test fun 상태_문구가_경우마다_다르다() {
    assertEquals(WidgetScheduleView.NO_AFTER_SCHOOL_MESSAGE, build(day(hasSchool = true), "10:00").message)
    assertEquals(WidgetDayResolver.NO_SCHEDULE_MESSAGE, build(day(hasSchool = false), "10:00").message)
    val stale = WidgetScheduleView.build(snapshot(day(date = "2026-09-28")), "2026-09-30", "10:00", 5)
    assertEquals(WidgetDayResolver.STALE_MESSAGE, stale.message)
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetScheduleView.build(null, "2026-09-30", "10:00", 5).message)
  }

  @Test fun 위젯_높이에_따라_보이는_줄_수가_정해진다() {
    assertEquals(2, WidgetScheduleView.capacityFor(70)) // 아주 작아도 최소 2줄
    assertEquals(2, WidgetScheduleView.capacityFor(110)) // 4x2 기본
    assertEquals(3, WidgetScheduleView.capacityFor(130))
    assertEquals(5, WidgetScheduleView.capacityFor(180)) // 4x3
    assertEquals(5, WidgetScheduleView.capacityFor(400)) // 최대 5줄
  }

  @Test fun 글자_크기_설정이_크면_줄_수가_줄어든다() {
    assertEquals(5, WidgetScheduleView.capacityFor(180, 1.0f))
    assertEquals(3, WidgetScheduleView.capacityFor(180, 1.3f))
    assertEquals(5, WidgetScheduleView.capacityFor(180, 0.85f)) // 작게 해도 기본보다 늘리지 않는다
  }

  @Test fun 일정이_있고_지난_일정만_있으면_문구_대신_지난_일정을_흐리게_보여준다() {
    val view = build(day(entry("영어", "09:00", "10:00")), "20:00")
    assertNull(view.message)
    assertEquals(RowState.PAST, view.rows.single().state)
  }
}
