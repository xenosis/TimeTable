package com.sewoong.kidtimetable.widget

import org.json.JSONObject

/** 위젯이 그리는 데이터. 안드로이드 API에 의존하지 않아 단위 테스트가 쉽다. */
data class WidgetScheduleEntry(
  val title: String,
  /** "HH:MM" (0으로 채워져 있어 문자열 비교가 시각 비교와 같다) */
  val startTime: String,
  val endTime: String,
  val backgroundColor: String,
  val textColor: String,
)

data class WidgetTaskEntry(val id: Int, val title: String, val completed: Boolean)

data class WidgetDay(
  /** yyyy-MM-dd, 기기 로컬 날짜 */
  val date: String,
  val schedule: List<WidgetScheduleEntry>,
  val tasks: List<WidgetTaskEntry>,
  /** 하루 상한을 넘어 담지 못한 개수. 0이 아니면 위젯이 "+N개"로 알린다 */
  val hiddenScheduleCount: Int,
  val hiddenTaskCount: Int,
  /** 그날 학교 정규 수업이 있는지(위젯에는 수업을 싣지 않으므로 상태 문구를 나누는 데만 쓴다) */
  val hasSchool: Boolean = false,
)

/** 앱 테마의 대비가 보장된 색(#RRGGBB). 안드로이드 색으로 바꾸는 일은 그리는 쪽이 한다. */
data class WidgetTheme(
  val background: String,
  val surface: String,
  val text: String,
  val textMuted: String,
  val primary: String,
  val onPrimary: String,
  val border: String,
)

data class WidgetSnapshot(
  val timetableName: String,
  val updatedAt: String,
  val days: List<WidgetDay>,
  val theme: WidgetTheme? = null,
)

/** 파일에 저장된 JSON을 읽는다. v2(7일치)와, 앱 쓰기가 v2로 바뀌기 전까지 들어오는 v1(오늘 한 벌)을 모두 지원한다. */
object WidgetSnapshotParser {
  fun parse(payload: String): WidgetSnapshot? = try {
    val json = JSONObject(payload)
    when (json.optInt("schemaVersion")) {
      2 -> parseV2(json)
      1 -> parseV1(json)
      else -> null
    }
  } catch (_: Exception) { null }

  private fun parseV2(json: JSONObject): WidgetSnapshot {
    val days = json.optJSONArray("days") ?: org.json.JSONArray()
    return WidgetSnapshot(
      timetableName = json.optString("timetableName"),
      updatedAt = json.optString("updatedAt"),
      theme = json.optJSONObject("theme")?.let { theme(it) },
      days = (0 until days.length()).mapNotNull { days.optJSONObject(it) }.map { day ->
        val schedule = day.optJSONArray("schedule") ?: org.json.JSONArray()
        val tasks = day.optJSONArray("tasks") ?: org.json.JSONArray()
        WidgetDay(
          date = day.optString("date"),
          schedule = (0 until schedule.length()).mapNotNull { schedule.optJSONObject(it) }.map { entry(it) },
          tasks = (0 until tasks.length()).mapNotNull { tasks.optJSONObject(it) }.map { WidgetTaskEntry(it.optInt("id"), it.optString("title"), it.optBoolean("completed")) },
          hiddenScheduleCount = day.optInt("hiddenScheduleCount"),
          hiddenTaskCount = day.optInt("hiddenTaskCount"),
          hasSchool = day.optBoolean("hasSchool"),
        )
      },
    )
  }

  private fun theme(json: JSONObject) = WidgetTheme(
    background = json.optString("background"),
    surface = json.optString("surface"),
    text = json.optString("text"),
    textMuted = json.optString("textMuted"),
    primary = json.optString("primary"),
    onPrimary = json.optString("onPrimary"),
    border = json.optString("border"),
  )

  /** v1은 scheduleDate 하루치만 있고 색·할 일이 없다. 하루짜리 v2로 바꿔 같은 로직을 쓴다. */
  private fun parseV1(json: JSONObject): WidgetSnapshot {
    val schedule = json.optJSONArray("schedule") ?: org.json.JSONArray()
    return WidgetSnapshot(
      timetableName = "",
      updatedAt = json.optString("updatedAt"),
      days = listOf(WidgetDay(
        date = json.optString("scheduleDate"),
        schedule = (0 until schedule.length()).mapNotNull { schedule.optJSONObject(it) }.map { entry(it) },
        tasks = emptyList(),
        hiddenScheduleCount = 0,
        hiddenTaskCount = 0,
      )),
    )
  }

  private fun entry(json: JSONObject) = WidgetScheduleEntry(
    title = json.optString("title"),
    startTime = json.optString("startTime"),
    endTime = json.optString("endTime"),
    backgroundColor = json.optString("backgroundColor"),
    textColor = json.optString("textColor"),
  )
}
