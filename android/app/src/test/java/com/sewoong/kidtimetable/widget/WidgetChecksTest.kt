package com.sewoong.kidtimetable.widget

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetChecksTest {
  private fun snapshot(): String = """
    {"schemaVersion":2,"updatedAt":"2026-10-01T00:00:00.000Z","timetableName":"평소","days":[
      {"date":"2026-10-01","weekday":4,"schedule":[],"hasSchool":false,"hiddenScheduleCount":0,"hiddenTaskCount":0,
       "tasks":[{"id":1,"title":"숙제","completed":false},{"id":2,"title":"준비물","completed":true}]},
      {"date":"2026-10-02","weekday":5,"schedule":[],"hasSchool":false,"hiddenScheduleCount":0,"hiddenTaskCount":0,
       "tasks":[{"id":1,"title":"숙제","completed":false}]}
    ]}
  """.trimIndent()

  private fun completedOf(snapshotJson: String, date: String, taskId: Int): Boolean {
    val days = JSONObject(snapshotJson).getJSONArray("days")
    for (i in 0 until days.length()) {
      val day = days.getJSONObject(i)
      if (day.getString("date") != date) continue
      val tasks = day.getJSONArray("tasks")
      for (j in 0 until tasks.length()) if (tasks.getJSONObject(j).getInt("id") == taskId) return tasks.getJSONObject(j).getBoolean("completed")
    }
    throw AssertionError("할 일을 찾지 못함")
  }

  @Test fun 못_한_일을_누르면_완료로_바꾸고_대기_목록에_남긴다() {
    val result = WidgetChecks.toggle(snapshot(), null, 1, "2026-10-01")
    assertNotNull(result)
    assertEquals(true, completedOf(result!!.snapshotJson, "2026-10-01", 1))
    assertEquals(listOf(PendingCheck(1, "2026-10-01", true)), WidgetChecks.parse(result.pendingJson))
  }

  @Test fun 이미_끝낸_일을_누르면_미완료로_되돌리고_대기_목록에_남긴다() {
    val result = WidgetChecks.toggle(snapshot(), null, 2, "2026-10-01")!!
    assertEquals(false, completedOf(result.snapshotJson, "2026-10-01", 2))
    assertEquals(listOf(PendingCheck(2, "2026-10-01", false)), WidgetChecks.parse(result.pendingJson))
  }

  @Test fun 연달아_누르면_번갈아_바뀌고_대기_기록은_마지막_상태_한_건이다() {
    val first = WidgetChecks.toggle(snapshot(), null, 1, "2026-10-01")!!
    val second = WidgetChecks.toggle(first.snapshotJson, first.pendingJson, 1, "2026-10-01")!!
    assertEquals(false, completedOf(second.snapshotJson, "2026-10-01", 1))
    assertEquals(listOf(PendingCheck(1, "2026-10-01", false)), WidgetChecks.parse(second.pendingJson))
    val third = WidgetChecks.toggle(second.snapshotJson, second.pendingJson, 1, "2026-10-01")!!
    assertEquals(listOf(PendingCheck(1, "2026-10-01", true)), WidgetChecks.parse(third.pendingJson))
  }

  @Test fun 다른_날짜의_같은_할_일은_건드리지_않는다() {
    val result = WidgetChecks.toggle(snapshot(), null, 1, "2026-10-01")!!
    assertEquals(false, completedOf(result.snapshotJson, "2026-10-02", 1))
  }

  @Test fun 다른_할_일을_누르면_대기_목록_뒤에_붙는다() {
    val first = WidgetChecks.toggle(snapshot(), null, 1, "2026-10-01")!!
    val second = WidgetChecks.toggle(first.snapshotJson, first.pendingJson, 1, "2026-10-02")!!
    assertEquals(listOf(PendingCheck(1, "2026-10-01", true), PendingCheck(1, "2026-10-02", true)), WidgetChecks.parse(second.pendingJson))
  }

  @Test fun 데이터에_없는_할_일이나_날짜는_아무것도_바꾸지_않는다() {
    assertNull(WidgetChecks.toggle(snapshot(), null, 99, "2026-10-01"))
    assertNull(WidgetChecks.toggle(snapshot(), null, 1, "2026-12-25"))
  }

  @Test fun 깨진_데이터는_null이다() {
    assertNull(WidgetChecks.toggle("not-json", null, 1, "2026-10-01"))
    assertNull(WidgetChecks.toggle("{}", null, 1, "2026-10-01"))
  }

  @Test fun 앱이_새로_쓴_데이터에_대기_체크를_다시_입힌다() {
    // 앱이 DB를 읽은 뒤(아직 완료 기록이 없음) 사용자가 눌러 대기 목록에 남은 체크가 새 데이터에서 되돌아가 보이면 안 된다
    val fresh = snapshot()
    assertEquals(false, completedOf(fresh, "2026-10-01", 1))
    val merged = WidgetChecks.applyPending(fresh, listOf(PendingCheck(1, "2026-10-01", true)))
    assertEquals(true, completedOf(merged, "2026-10-01", 1))
    assertEquals(false, completedOf(merged, "2026-10-02", 1)) // 다른 날짜는 그대로
  }

  @Test fun 대기_체크가_없거나_데이터가_깨졌으면_그대로_돌려준다() {
    assertEquals(snapshot(), WidgetChecks.applyPending(snapshot(), emptyList()))
    assertEquals("not-json", WidgetChecks.applyPending("not-json", listOf(PendingCheck(1, "2026-10-01", true))))
  }

  @Test fun 기록한_체크만_대기_목록에서_지우고_그_사이_새로_눌린_체크는_남긴다() {
    val pending = WidgetChecks.encode(listOf(PendingCheck(1, "2026-10-01", true), PendingCheck(3, "2026-10-01", true)))
    val remaining = WidgetChecks.removeApplied(pending, listOf(PendingCheck(1, "2026-10-01", true)))
    assertEquals(listOf(PendingCheck(3, "2026-10-01", true)), WidgetChecks.parse(remaining))
  }

  @Test fun 상태가_다르면_같은_할_일이어도_지우지_않는다() {
    val pending = WidgetChecks.encode(listOf(PendingCheck(1, "2026-10-01", true)))
    val remaining = WidgetChecks.removeApplied(pending, listOf(PendingCheck(1, "2026-10-01", false)))
    assertEquals(listOf(PendingCheck(1, "2026-10-01", true)), WidgetChecks.parse(remaining))
  }

  @Test fun 대기_목록이_깨져_있으면_빈_목록으로_본다() {
    assertEquals(emptyList<PendingCheck>(), WidgetChecks.parse("not-json"))
    assertEquals(emptyList<PendingCheck>(), WidgetChecks.parse(null))
    assertEquals(emptyList<PendingCheck>(), WidgetChecks.parse(""))
  }

  @Test fun 대기_목록의_형식이_틀린_항목은_버린다() {
    val json = """[{"taskId":1,"date":"2026-10-01","completed":true},{"taskId":-1,"date":"2026-10-01","completed":true},{"taskId":2,"date":"","completed":true},{"taskId":3,"date":"2026-10-01"}]"""
    assertEquals(listOf(PendingCheck(1, "2026-10-01", true)), WidgetChecks.parse(json))
  }

  @Test fun 체크를_저장하고_다시_읽어도_같다() {
    val checks = listOf(PendingCheck(1, "2026-10-01", true), PendingCheck(2, "2026-10-02", false))
    assertEquals(checks, WidgetChecks.parse(WidgetChecks.encode(checks)))
  }
}
