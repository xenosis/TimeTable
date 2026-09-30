package com.sewoong.kidtimetable.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri

/** 일정·할 일 위젯이 함께 쓰는 그리기 도우미. */
object WidgetRenderSupport {
  const val DEFAULT_BACKGROUND = 0xFFFFFFFF.toInt()
  const val DEFAULT_TEXT = 0xFF1E293B.toInt()
  const val DEFAULT_MUTED = 0xFF64748B.toInt()

  /** "#RRGGBB" 같은 문자열을 색으로 바꾼다. 비어 있거나 깨진 값이면 fallback을 쓴다. */
  fun color(value: String?, fallback: Int): Int = try {
    if (value.isNullOrBlank()) fallback else Color.parseColor(value)
  } catch (_: IllegalArgumentException) { fallback }

  fun withAlpha(color: Int, alpha: Int): Int = (alpha.coerceIn(0, 255) shl 24) or (color and 0x00FFFFFF)

  /**
   * 위젯이 지금 화면에서 실제로 차지하는 높이(dp). 안드로이드는 MIN_HEIGHT를 가로 화면의 높이, MAX_HEIGHT를 세로 화면의 높이로 알려 준다.
   * 세로 화면에서 MIN_HEIGHT를 쓰면 위젯보다 작다고 읽어 줄을 덜 그리게 된다. 값을 못 읽으면 fallback을 쓴다.
   */
  fun heightDp(context: Context, manager: AppWidgetManager, id: Int, fallback: Int): Int {
    val options = manager.getAppWidgetOptions(id)
    val portrait = context.resources.configuration.orientation != Configuration.ORIENTATION_LANDSCAPE
    val preferred = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
    val other = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
    return listOf(preferred, other).firstOrNull { it > 0 } ?: fallback
  }

  /** 사용자의 글자 크기 설정(1.0이 기본). 큰 글씨 설정에서 위젯 줄이 잘리지 않게 줄 수를 줄이는 데 쓴다. */
  fun fontScale(context: Context): Float = context.resources.configuration.fontScale

  /** 위젯을 누르면 앱 오늘 화면으로 간다. */
  fun openAppIntent(context: Context, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kidtimetable://"), context, Class.forName("com.sewoong.kidtimetable.MainActivity"))
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
