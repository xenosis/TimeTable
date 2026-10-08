package com.sewoong.kidtimetable.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri

/** 일정·할 일 위젯이 함께 쓰는 그리기 도우미. */
object WidgetRenderSupport {
  const val DEFAULT_BACKGROUND = 0xFFFFFFFF.toInt()
  const val DEFAULT_TEXT = 0xFF1E293B.toInt()
  const val DEFAULT_MUTED = 0xFF64748B.toInt()

  /**
   * "#RRGGBB"·"#AARRGGBB" 문자열을 색으로 바꾼다. 비어 있거나 깨진 값이면 fallback을 쓴다.
   * 안드로이드 Color 없이 직접 읽어 JVM 단위 테스트로 확인할 수 있게 한다(P7.5 리뷰).
   */
  fun color(value: String?, fallback: Int): Int {
    val hex = value?.trim()?.removePrefix("#") ?: return fallback
    if ((hex.length != 6 && hex.length != 8) || !hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return fallback
    val parsed = hex.toLong(16).toInt()
    return if (hex.length == 6) parsed or 0xFF000000.toInt() else parsed
  }

  fun withAlpha(color: Int, alpha: Int): Int = (alpha.coerceIn(0, 255) shl 24) or (color and 0x00FFFFFF)

  /**
   * 스크롤 목록의 항목을 만들 서비스 연결 인텐트. 위젯마다 다른 주소(data)를 줘야 안드로이드가 목록을 위젯별로 따로 만든다.
   */
  fun listServiceIntent(context: Context, service: Class<*>, widgetId: Int): Intent =
    Intent(context, service).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId).apply { data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME)) }

  /** 위젯을 누르면 앱 오늘 화면으로 간다. */
  fun openAppIntent(context: Context, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kidtimetable://"), context, Class.forName("com.sewoong.kidtimetable.MainActivity"))
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** 목록 줄을 누르면 앱 오늘 화면으로 가는 템플릿. 줄이 fill-in을 채우므로 mutable이어야 한다(안드로이드 12+ 목록 템플릿 규칙). */
  fun openAppTemplate(context: Context, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kidtimetable://"), context, Class.forName("com.sewoong.kidtimetable.MainActivity"))
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
  }
}
