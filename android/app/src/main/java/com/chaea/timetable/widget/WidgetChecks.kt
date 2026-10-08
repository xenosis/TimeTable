package com.chaea.timetable.widget

import org.json.JSONArray
import org.json.JSONObject

/** 위젯에서 누른 체크 한 건. 앱이 다음에 실행될 때 DB에 기록한다. */
data class PendingCheck(val taskId: Int, val date: String, val completed: Boolean)

data class CompleteResult(
  /** 그 할 일의 완료 상태를 뒤집은 위젯 데이터(JSON). 위젯을 즉시 다시 그리는 데 쓴다 */
  val snapshotJson: String,
  /** 대기 중인 체크 목록(JSON 배열). 같은 할 일·날짜는 가장 마지막 상태 하나만 남는다 */
  val pendingJson: String,
)

/**
 * 위젯의 할 일 줄을 눌렀을 때의 순수 계산. 안드로이드 API를 쓰지 않아 JUnit으로 검증한다.
 * DB에는 직접 쓰지 않는다: 보석 계산과 중복 방지 규칙은 앱(JS)의 한 곳에만 두고, 위젯은 누른 사실만 남겨 앱이 같은 함수로 기록하게 한다.
 * 줄을 누를 때마다 완료와 미완료가 번갈아 바뀐다(앱 안에서 체크하는 것과 같다).
 */
object WidgetChecks {
  /**
   * snapshotJson의 [date] 날짜에서 [taskId] 할 일의 완료 상태를 뒤집고 대기 목록에 남긴다.
   * 그 날짜나 할 일이 데이터에 없으면 null(아무것도 바꾸지 않는다).
   */
  fun toggle(snapshotJson: String, pendingJson: String?, taskId: Int, date: String): CompleteResult? = try {
    val snapshot = JSONObject(snapshotJson)
    val days = snapshot.optJSONArray("days") ?: return null
    var newState: Boolean? = null
    for (index in 0 until days.length()) {
      val day = days.optJSONObject(index) ?: continue
      if (day.optString("date") != date) continue
      val tasks = day.optJSONArray("tasks") ?: continue
      for (position in 0 until tasks.length()) {
        val task = tasks.optJSONObject(position) ?: continue
        if (task.optInt("id", -1) != taskId) continue
        val next = !task.optBoolean("completed")
        task.put("completed", next)
        newState = next
      }
    }
    newState?.let { CompleteResult(snapshot.toString(), withCheck(pendingJson, PendingCheck(taskId, date, it))) }
  } catch (_: Exception) { null }

  /**
   * 앱이 새로 쓴 위젯 데이터에 아직 기록되지 않은 대기 체크를 다시 입힌다.
   * 앱이 DB를 읽은 뒤 쓰기 전에 사용자가 누른 체크가 덮여 사라져 보이지 않게 한다. 깨진 데이터는 그대로 돌려준다.
   */
  fun applyPending(snapshotJson: String, pending: List<PendingCheck>): String = try {
    if (pending.isEmpty()) snapshotJson else {
      val snapshot = JSONObject(snapshotJson)
      val days = snapshot.optJSONArray("days")
      if (days != null) for (index in 0 until days.length()) {
        val day = days.optJSONObject(index) ?: continue
        val tasks = day.optJSONArray("tasks") ?: continue
        for (position in 0 until tasks.length()) {
          val task = tasks.optJSONObject(position) ?: continue
          val check = pending.lastOrNull { it.taskId == task.optInt("id", -1) && it.date == day.optString("date") } ?: continue
          task.put("completed", check.completed)
        }
      }
      snapshot.toString()
    }
  } catch (_: Exception) { snapshotJson }

  /**
   * 앱이 DB에 기록한 체크를 대기 목록에서 지운다. 같은 (할 일, 날짜, 상태)인 것만 지우므로
   * 앱이 기록하는 동안 새로 눌린 체크는 그대로 남는다.
   */
  fun removeApplied(pendingJson: String?, applied: List<PendingCheck>): String =
    encode(parse(pendingJson).filterNot { it in applied })

  /** 같은 (할 일, 날짜)의 이전 기록을 지우고 이번 상태를 맨 뒤에 붙인다. */
  fun withCheck(pendingJson: String?, check: PendingCheck): String {
    val kept = parse(pendingJson).filterNot { it.taskId == check.taskId && it.date == check.date }
    return encode(kept + check)
  }

  fun parse(pendingJson: String?): List<PendingCheck> = try {
    if (pendingJson.isNullOrBlank()) emptyList() else {
      val array = JSONArray(pendingJson)
      (0 until array.length()).mapNotNull { array.optJSONObject(it) }.mapNotNull { item ->
        val id = item.optInt("taskId", -1)
        val date = item.optString("date")
        if (id < 0 || date.isBlank() || !item.has("completed")) null else PendingCheck(id, date, item.optBoolean("completed"))
      }
    }
  } catch (_: Exception) { emptyList() }

  fun encode(checks: List<PendingCheck>): String = JSONArray().apply {
    checks.forEach { put(JSONObject().put("taskId", it.taskId).put("date", it.date).put("completed", it.completed)) }
  }.toString()
}
