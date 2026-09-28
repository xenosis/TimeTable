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
    val target = File(context.filesDir, FILE_NAME)
    val temporary = File(context.filesDir, "$FILE_NAME.tmp")
    temporary.writeText(payload, Charsets.UTF_8)
    check(temporary.renameTo(target))
  }
  fun read(context: Context): JSONObject? = try {
    val file = File(context.filesDir, FILE_NAME)
    if (file.exists() && file.length() <= MAX_BYTES) JSONObject(file.readText(Charsets.UTF_8)) else null
  } catch (_: Exception) { null }
}

