package com.chaea.timetable.push

import android.app.NotificationManager
import android.content.Context
import org.json.JSONObject

/** 같은 가족의 역할에 맞는 변경·완료 푸시만 표시한다. 로그아웃은 서버 연결 없이 차단한다. */
object FamilyPushPolicy {
  const val TAG = "family-change"
  const val ID = 6901
  private const val PREFS = "family-push-policy"
  fun setFamily(context: Context, familyId: String?) {
    synchronized(this) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (prefs.getString("family", null) == familyId) return
      if (!prefs.edit().putString("family", familyId).commit()) throw IllegalStateException("푸시 설정을 저장하지 못했어요.")
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(TAG, ID)
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel("tasks-completed", ID + 1)
    }
  }
  fun family(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("family", null)
  fun messageFamily(data: Map<String, String>): String? = try {
    val body = data["body"]?.let { JSONObject(it) }
    val type = body?.optString("type") ?: data["type"]
    val family = body?.optString("familyId") ?: data["familyId"]
    if (type in listOf("family-change", "tasks-completed") && !family.isNullOrBlank()) family else null
  } catch (_: Exception) { null }
  fun messageType(data: Map<String, String>): String? = try {
    data["body"]?.let { JSONObject(it).optString("type") } ?: data["type"]
  } catch (_: Exception) { null }
  fun messageDate(data: Map<String, String>): String? = try {
    data["body"]?.let { JSONObject(it).optString("completionDate") } ?: data["completionDate"]
  } catch (_: Exception) { null }
  fun completionIsToday(date: String?, today: String): Boolean = date == today
  fun messageOrder(data: Map<String, String>): Long? = try {
    val value = data["body"]?.let { JSONObject(it).optString("changeOrder") } ?: data["changeOrder"]
    value?.takeIf { it.matches(Regex("[1-9][0-9]*")) }?.toLongOrNull()
  } catch (_: Exception) { null }
  fun isNewer(order: Long?, previous: Long): Boolean = order != null && order > previous && order > 0
  fun previousOrder(context: Context, family: String, type: String = TAG): Long {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    // 변경 푸시의 기존 표시 순서는 업데이트 후에도 보존한다.
    val previous = if (type == TAG) prefs.getLong("order.$family", 0) else 0
    return prefs.getLong("order.$type.$family", previous)
  }
  fun rememberOrder(context: Context, family: String, order: Long, type: String = TAG) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("order.$type.$family", order).commit()
  }
  fun shouldShow(allowedFamily: String?, messageFamily: String?, parentDevice: Boolean, type: String = TAG): Boolean =
    !allowedFamily.isNullOrBlank() && messageFamily == allowedFamily &&
      ((type == TAG && !parentDevice) || (type == "tasks-completed" && parentDevice))
}
