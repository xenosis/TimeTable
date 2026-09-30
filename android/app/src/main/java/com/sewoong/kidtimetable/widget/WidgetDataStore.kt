package com.sewoong.kidtimetable.widget

import android.content.Context
import org.json.JSONObject
import java.io.File

object WidgetDataStore {
  private const val FILE_NAME = "widget-data.json"
  private const val MAX_BYTES = 64 * 1024
  fun write(context: Context, payload: String) {
    require(payload.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "Widget data is too large." }
    JSONObject(payload)
    // 아직 앱이 DB에 기록하지 못한 위젯 체크를 새 데이터에 다시 입혀 같은 잠금 안에서 쓴다
    WidgetCheckStore.writeData(context, payload)
  }
  fun read(context: Context): JSONObject? = try {
    val file = File(context.filesDir, FILE_NAME)
    if (file.exists() && file.length() <= MAX_BYTES) JSONObject(file.readText(Charsets.UTF_8)) else null
  } catch (_: Exception) { null }

  /** 저장된 데이터를 위젯이 그리는 모델로 읽는다. 없거나 깨졌거나 모르는 버전이면 null. */
  fun readSnapshot(context: Context): WidgetSnapshot? = try {
    val file = File(context.filesDir, FILE_NAME)
    if (file.exists() && file.length() <= MAX_BYTES) WidgetSnapshotParser.parse(file.readText(Charsets.UTF_8)) else null
  } catch (_: Exception) { null }
}
