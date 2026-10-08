package com.chaea.timetable.widget

import org.junit.Assert.assertEquals
import org.junit.Test

/** 위젯 테마 색 읽기와 테마 데이터가 없거나 깨졌을 때의 기본색(P7.5). */
class WidgetRenderSupportTest {
  private val fallback = WidgetRenderSupport.DEFAULT_TEXT

  @Test fun 여섯자리_색은_불투명으로_읽는다() {
    assertEquals(0xFF172554.toInt(), WidgetRenderSupport.color("#172554", fallback))
    assertEquals(0xFFF8F3FF.toInt(), WidgetRenderSupport.color("#f8f3ff", fallback))
  }

  @Test fun 여덟자리_색은_알파를_그대로_쓴다() {
    assertEquals(0x80123456.toInt(), WidgetRenderSupport.color("#80123456", fallback))
  }

  @Test fun 없거나_비거나_깨진_값은_기본색을_쓴다() {
    for (value in listOf(null, "", "   ", "#12345", "#GGGGGG", "red", "#1234567")) {
      assertEquals(value.toString(), fallback, WidgetRenderSupport.color(value, fallback))
    }
  }

  @Test fun 기본색끼리도_글자_대비가_충분하다() {
    // 테마 데이터가 없을 때 쓰는 흰 배경 위 글자·흐린 글자 대비(4.5:1 이상)
    assertEquals(true, contrast(WidgetRenderSupport.DEFAULT_TEXT, WidgetRenderSupport.DEFAULT_BACKGROUND) >= 4.5)
    assertEquals(true, contrast(WidgetRenderSupport.DEFAULT_MUTED, WidgetRenderSupport.DEFAULT_BACKGROUND) >= 4.5)
  }

  private fun luminance(color: Int): Double {
    fun channel(shift: Int): Double {
      val value = ((color shr shift) and 0xFF) / 255.0
      return if (value <= 0.03928) value / 12.92 else Math.pow((value + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  }

  private fun contrast(a: Int, b: Int): Double {
    val (light, dark) = listOf(luminance(a), luminance(b)).sortedDescending()
    return (light + 0.05) / (dark + 0.05)
  }
}
