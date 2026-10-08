package com.chaea.timetable.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetTaskViewTest {
  private fun task(id: Int, title: String, completed: Boolean = false) = WidgetTaskEntry(id, title, completed)

  private fun day(vararg tasks: WidgetTaskEntry, hidden: Int = 0, date: String = "2026-09-30") =
    WidgetDay(date, emptyList(), tasks.toList(), 0, hidden)

  private fun build(day: WidgetDay) =
    WidgetTaskView.build(WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day)), day.date)

  @Test fun 제목에_끝낸_개수와_전체_개수가_나온다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물"), task(3, "책 읽기")))
    assertEquals("오늘 할 일 1/3", view.heading)
    assertNull(view.message)
  }

  @Test fun 할_일은_많아도_모두_원래_순서로_목록에_담겨_위젯_안에서_스크롤한다() {
    val tasks = (1..9).map { task(it, "할$it", completed = it % 3 == 0) }.toTypedArray()
    val view = build(day(*tasks))
    assertEquals((1..9).map { "할$it" }, view.rows.map { it.title })
    assertEquals(listOf(false, false, true, false, false, true, false, false, true), view.rows.map { it.completed })
    assertEquals(0, view.moreCount) // 줄을 빼지 않으므로 '+ N개'가 없다
  }

  @Test fun 하나를_완료해도_줄_순서와_개수가_그대로라_누른_자리에서_다시_되돌릴_수_있다() {
    val before = build(day(task(1, "a"), task(2, "b"), task(3, "c")))
    val after = build(day(task(1, "a"), task(2, "b", true), task(3, "c")))
    assertEquals(before.rows.map { it.id }, after.rows.map { it.id })
    assertEquals(true, after.rows[1].completed)
  }

  @Test fun 할_일이_없으면_없다고_알려준다() {
    val view = build(day())
    assertEquals(WidgetTaskView.NO_TASKS_MESSAGE, view.message)
    assertEquals(true, view.rows.isEmpty())
  }

  @Test fun 모두_끝냈으면_칭찬_문구와_함께_목록을_그대로_보여준다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물", true), task(3, "책 읽기", true), task(4, "줄넘기", true)))
    assertEquals(WidgetTaskView.ALL_DONE_MESSAGE, view.message)
    assertEquals("오늘 할 일 4/4", view.heading)
    // 줄은 그대로 보여서 다시 눌러 되돌릴 수 있다
    assertEquals(listOf("숙제", "준비물", "책 읽기", "줄넘기"), view.rows.map { it.title })
    assertEquals(0, view.moreCount)
  }

  @Test fun 앱이_상한_때문에_못_담은_할_일이_있으면_다_했다고_하지_않고_더보기로_센다() {
    val view = build(day(task(1, "숙제", true), task(2, "준비물", true), hidden = 3))
    assertNull(view.message)
    assertEquals("오늘 할 일", view.heading) // 개수를 알 수 없으니 n/m을 보이지 않는다
    assertEquals(3, view.moreCount)
    assertEquals(2, view.rows.size)
  }

  @Test fun 오늘_데이터가_없으면_안내_문구만_보인다() {
    val stale = WidgetSnapshot("평소", "2026-09-28T01:00:00.000Z", listOf(day(task(1, "옛 할 일"), date = "2026-09-28")))
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetTaskView.build(stale, "2026-09-30").message)
    assertEquals(WidgetDayResolver.STALE_MESSAGE, WidgetTaskView.build(null, "2026-09-30").message)
  }

  @Test fun 앱을_열지_않고_날짜가_바뀌어도_새_날짜의_할_일을_고른다() {
    val snapshot = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day(task(1, "수요일 할 일"), date = "2026-09-30"), day(task(2, "목요일 할 일"), date = "2026-10-01")))
    assertEquals("목요일 할 일", WidgetTaskView.build(snapshot, "2026-10-01").rows.single().title)
  }

  @Test fun 화면이_그리는_날짜를_담아_눌렀을_때_그_날짜의_체크가_되게_한다() {
    val snapshot = WidgetSnapshot("평소", "2026-09-30T01:00:00.000Z", listOf(day(task(1, "수요일 할 일"), date = "2026-09-30"), day(task(2, "목요일 할 일"), date = "2026-10-01")))
    assertEquals("2026-10-01", WidgetTaskView.build(snapshot, "2026-10-01").date)
    assertEquals("2026-09-30", WidgetTaskView.build(snapshot, "2026-09-30").date)
    assertEquals("2026-10-05", WidgetTaskView.build(snapshot, "2026-10-05").date) // 데이터가 없어도 오늘 날짜
  }
}
