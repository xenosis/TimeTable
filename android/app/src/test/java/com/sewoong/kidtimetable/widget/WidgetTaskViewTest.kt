package com.sewoong.kidtimetable.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetTaskViewTest {
  private fun task(id: Int, title: String, completed: Boolean = false) = WidgetTaskEntry(id, title, completed)

  private fun day(vararg tasks: WidgetTaskEntry, hidden: Int = 0, date: String = "2026-09-30") =
    WidgetDay(date, emptyList(), tasks.toList(), 0, hidden)

  private fun build(day: WidgetDay, capacity: Int = 4, touched: Set<Int> = emptySet()) =
    WidgetTaskView.build(WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day)), day.date, capacity, touched)

  @Test fun 제목에_끝낸_개수와_전체_개수가_나온다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물"), task(3, "책 읽기")))
    assertEquals("오늘 할 일 1/3", view.heading)
    assertNull(view.message)
  }

  @Test fun 다_들어가면_원래_순서를_그대로_보여주고_끝낸_일은_그_자리에서_흐리게_보인다() {
    val view = build(day(task(1, "끝낸 일", true), task(2, "못 한 일 A"), task(3, "끝낸 일 2", true), task(4, "못 한 일 B")))
    assertEquals(listOf("끝낸 일", "못 한 일 A", "끝낸 일 2", "못 한 일 B"), view.rows.map { it.title })
    assertEquals(listOf(true, false, true, false), view.rows.map { it.completed })
  }

  @Test fun 줄이_모자라도_보이는_줄은_원래_순서를_지킨다() {
    val tasks = arrayOf(task(1, "할1"), task(2, "끝냄1", true), task(3, "할2"), task(4, "끝냄2", true), task(5, "할3"), task(6, "할4"))
    val view = build(day(*tasks), capacity = 4)
    assertEquals(listOf("할1", "할2", "할3"), view.rows.map { it.title })
    assertEquals(3, view.moreCount)
  }

  @Test fun 줄이_모자라도_오늘_위젯에서_누른_끝낸_일은_빼지_않아_다시_눌러_되돌릴_수_있다() {
    // 딸 폰에서 본 경우: 5개 중 1·2·5를 끝냈고 5를 방금 위젯에서 눌렀다
    val tasks = arrayOf(task(1, "QT1", true), task(2, "QT2", true), task(3, "QT3"), task(4, "QT4"), task(5, "QT5", true))
    assertEquals(listOf("QT1", "QT3", "QT4"), build(day(*tasks), capacity = 4).rows.map { it.title })
    val view = build(day(*tasks), capacity = 4, touched = setOf(5))
    assertEquals(listOf("QT3", "QT4", "QT5"), view.rows.map { it.title })
    assertEquals(2, view.moreCount)
  }

  @Test fun 모두_끝낸_뒤_줄이_모자라도_마지막으로_누른_줄은_보인다() {
    val tasks = arrayOf(task(1, "가", true), task(2, "나", true), task(3, "다", true), task(4, "라", true))
    assertEquals(listOf("라"), build(day(*tasks), capacity = 3, touched = setOf(4)).rows.map { it.title })
  }

  @Test fun 하나를_완료해도_보이는_다른_줄의_위치는_바뀌지_않는다() {
    val before = build(day(task(1, "a"), task(2, "b"), task(3, "c")), capacity = 4)
    val after = build(day(task(1, "a"), task(2, "b", true), task(3, "c")), capacity = 4)
    assertEquals(before.rows.map { it.id }, after.rows.map { it.id })
  }

  @Test fun 할_일이_없으면_없다고_알려준다() {
    val view = build(day())
    assertEquals(WidgetTaskView.NO_TASKS_MESSAGE, view.message)
    assertEquals(true, view.rows.isEmpty())
  }

  @Test fun 모두_끝냈으면_칭찬_문구를_보여준다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물", true)), capacity = 4)
    assertEquals(WidgetTaskView.ALL_DONE_MESSAGE, view.message)
    assertEquals("오늘 할 일 2/2", view.heading)
    // 줄은 그대로 보여서 다시 눌러 되돌릴 수 있다
    assertEquals(listOf("숙제", "준비물"), view.rows.map { it.title })
    assertEquals(0, view.moreCount)
  }

  @Test fun 모두_끝낸_뒤_줄이_모자라면_칭찬_문구_한_줄을_빼고_나머지를_더보기로_센다() {
    val view = build(day(task(1, "가", true), task(2, "나", true), task(3, "다", true), task(4, "라", true)), capacity = 3)
    assertEquals(1, view.rows.size)
    assertEquals(3, view.moreCount)
  }

  @Test fun 작은_위젯에서_모두_끝내도_되돌릴_줄이_최소_한_줄_남는다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물", true)), capacity = 2)
    assertEquals(WidgetTaskView.ALL_DONE_MESSAGE, view.message)
    assertEquals(1, view.rows.size)
  }

  @Test fun 앱이_상한_때문에_못_담은_할_일이_있으면_다_했다고_하지_않는다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물", true), hidden = 3))
    assertNull(view.message)
    assertEquals("오늘 할 일", view.heading) // 개수를 알 수 없으니 n/m을 보이지 않는다
    assertEquals(3, view.moreCount)
  }

  @Test fun 줄이_모자라면_못_한_일을_남기고_끝낸_일부터_뺀다() {
    val tasks = arrayOf(task(1, "끝냄1", true), task(2, "끝냄2", true), task(3, "할1"), task(4, "할2"), task(5, "할3"), task(6, "할4"))
    val view = build(day(*tasks), capacity = 4)
    assertEquals(listOf("할1", "할2", "할3"), view.rows.map { it.title }) // 4줄 중 한 줄은 '+N개' 자리
    assertEquals(3, view.moreCount)
  }

  @Test fun 딱_맞게_들어가면_더보기_줄을_만들지_않는다() {
    val view = build(day(task(1, "a"), task(2, "b"), task(3, "c"), task(4, "d")), capacity = 4)
    assertEquals(4, view.rows.size)
    assertEquals(0, view.moreCount)
  }

  @Test fun 앱이_못_담은_개수도_더보기에_더한다() {
    val view = build(day(task(1, "a"), hidden = 2), capacity = 4)
    assertEquals(1, view.rows.size)
    assertEquals(2, view.moreCount)
  }

  @Test fun 오늘_데이터가_없으면_안내_문구만_보인다() {
    val stale = WidgetSnapshot("평소", "2026-09-28T01:00:00.000Z", listOf(day(task(1, "옛 할 일"), date = "2026-09-28")))
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetTaskView.build(stale, "2026-09-30", 4).message)
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetTaskView.build(null, "2026-09-30", 4).message)
  }

  @Test fun 앱을_열지_않고_날짜가_바뀌어도_새_날짜의_할_일을_고른다() {
    val snapshot = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day(task(1, "수요일 할 일"), date = "2026-09-30"), day(task(2, "목요일 할 일"), date = "2026-10-01")))
    assertEquals("목요일 할 일", WidgetTaskView.build(snapshot, "2026-10-01", 4).rows.single().title)
  }

  @Test fun 화면이_그리는_날짜를_담아_눌렀을_때_그_날짜의_체크가_되게_한다() {
    val snapshot = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day(task(1, "수요일 할 일"), date = "2026-09-30"), day(task(2, "목요일 할 일"), date = "2026-10-01")))
    assertEquals("2026-10-01", WidgetTaskView.build(snapshot, "2026-10-01", 4).date)
    assertEquals("2026-09-30", WidgetTaskView.build(snapshot, "2026-09-30", 4).date)
    assertEquals("2026-10-05", WidgetTaskView.build(snapshot, "2026-10-05", 4).date) // 데이터가 없어도 오늘 날짜
  }

  @Test fun 위젯_높이에_따라_보이는_줄_수가_정해진다() {
    assertEquals(2, WidgetTaskView.capacityFor(70))
    assertEquals(2, WidgetTaskView.capacityFor(110)) // 2x2 기본
    assertEquals(3, WidgetTaskView.capacityFor(150))
    assertEquals(4, WidgetTaskView.capacityFor(170))
    assertEquals(4, WidgetTaskView.capacityFor(400)) // 최대 4줄
  }

  @Test fun 글자_크기_설정이_크면_줄_수가_줄어든다() {
    assertEquals(4, WidgetTaskView.capacityFor(180, 1.0f))
    assertEquals(3, WidgetTaskView.capacityFor(180, 1.3f))
    assertEquals(4, WidgetTaskView.capacityFor(180, 0.85f)) // 작게 해도 기본보다 늘리지 않는다
  }
}
