package com.sewoong.kidtimetable.widget

import android.content.Context
import java.io.File

/** 위젯 데이터 파일과 대기 중인 체크 파일을 함께 다루는 저장소. 두 파일은 항상 같은 잠금 안에서 바꿔 어긋나지 않게 한다. */
object WidgetCheckStore {
  private const val PENDING_FILE = "widget-pending.json"
  private const val DATA_FILE = "widget-data.json"
  /** 오늘 위젯에서 누른 할 일 id. 줄이 모자라도 방금 누른 줄을 빼지 않아 위젯에서 바로 되돌릴 수 있게 한다 */
  private const val TOUCHED_FILE = "widget-touched.json"
  private val lock = Any()

  /** 위젯 줄을 눌렀을 때: 위젯 데이터에서 그 할 일의 완료 상태를 뒤집고 대기 목록에 남긴다. 바꿨으면 true. */
  fun toggle(context: Context, taskId: Int, date: String): Boolean = synchronized(lock) {
    val data = File(context.filesDir, DATA_FILE)
    if (!data.exists()) return false
    val pending = File(context.filesDir, PENDING_FILE)
    val result = WidgetChecks.toggle(data.readText(Charsets.UTF_8), readOrNull(pending), taskId, date) ?: return false
    // 대기 목록을 먼저 쓴다: 그 뒤에 죽더라도 '눌렀는데 기록이 없는' 일은 없다(최악은 위젯 표시만 예전 상태)
    writeAtomically(pending, result.pendingJson)
    writeAtomically(data, result.snapshotJson)
    val touched = File(context.filesDir, TOUCHED_FILE)
    runCatching { writeAtomically(touched, WidgetChecks.withTouched(readOrNull(touched), date, taskId)) }
    true
  }

  /** 오늘([date]) 위젯에서 누른 할 일 id. 읽지 못하면 빈 집합(줄 선택이 예전 규칙대로 동작할 뿐이다). */
  fun touched(context: Context, date: String): Set<Int> = synchronized(lock) {
    WidgetChecks.touchedIds(runCatching { readOrNull(File(context.filesDir, TOUCHED_FILE)) }.getOrNull(), date)
  }

  /**
   * 앱이 새 위젯 데이터를 쓴다. 아직 앱이 DB에 기록하지 못한 대기 체크를 새 데이터에 다시 입혀서,
   * 앱이 DB를 읽은 뒤 쓰기 전에 눌린 체크가 위젯에서 되돌아가 보이지 않게 한다.
   */
  fun writeData(context: Context, payload: String) = synchronized(lock) {
    val pending = WidgetChecks.parse(readOrNull(File(context.filesDir, PENDING_FILE)))
    writeAtomically(File(context.filesDir, DATA_FILE), WidgetChecks.applyPending(payload, pending))
  }

  /** 앱이 기록할 대기 체크를 읽는다(지우지 않는다). 기록에 성공한 뒤 [ack]로 지운다. */
  fun peek(context: Context): String = synchronized(lock) { readOrNull(File(context.filesDir, PENDING_FILE)) ?: "[]" }

  /** 앱이 DB에 기록한 체크만 대기 목록에서 지운다. 그 사이 새로 눌린 체크는 남는다. */
  fun ack(context: Context, appliedJson: String) = synchronized(lock) {
    val pending = File(context.filesDir, PENDING_FILE)
    val remaining = WidgetChecks.removeApplied(readOrNull(pending), WidgetChecks.parse(appliedJson))
    if (WidgetChecks.parse(remaining).isEmpty()) pending.delete() else writeAtomically(pending, remaining)
  }

  private fun readOrNull(file: File): String? = if (file.exists()) file.readText(Charsets.UTF_8) else null

  private fun writeAtomically(target: File, payload: String) {
    val temporary = File(target.parentFile, "${target.name}.tmp")
    temporary.writeText(payload, Charsets.UTF_8)
    check(temporary.renameTo(target)) { "${target.name} 저장에 실패했어요." }
  }
}
