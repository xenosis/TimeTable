package com.chaea.timetable.push

import android.app.NotificationManager
import android.content.Context
import org.json.JSONObject

/** 로그인한 딸 가족과 일치하는 변경 알림만 표시한다. 로그아웃은 서버 연결 없이 차단한다. */
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
    }
  }
  fun family(context: Context): String? = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("family", null)
  fun messageFamily(data: Map<String, String>): String? = try {
    val body = data["body"]?.let { JSONObject(it) }
    val type = body?.optString("type") ?: data["type"]
    val family = body?.optString("familyId") ?: data["familyId"]
    if (type == "family-change" && !family.isNullOrBlank()) family else null
  } catch (_: Exception) { null }
  fun messageOrder(data: Map<String, String>): Long? = try {
    val value = data["body"]?.let { JSONObject(it).optString("changeOrder") } ?: data["changeOrder"]
    value?.takeIf { it.matches(Regex("[1-9][0-9]*")) }?.toLongOrNull()
  } catch (_: Exception) { null }
  fun isNewer(order: Long?, previous: Long): Boolean = order != null && order > previous && order > 0
  fun previousOrder(context: Context, family: String): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("order.$family", 0)
  fun rememberOrder(context: Context, family: String, order: Long) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("order.$family", order).commit()
  }
  fun shouldShow(allowedFamily: String?, messageFamily: String?, parentDevice: Boolean): Boolean =
    !parentDevice && !allowedFamily.isNullOrBlank() && messageFamily == allowedFamily
}
