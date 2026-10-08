package com.chaea.timetable.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmMemoTextTest {
  @Test fun 메모가_없으면_기존_문구_그대로다() {
    assertEquals("영어 학원 시간이에요.", AlarmMemoText.body("영어 학원", ""))
    assertEquals("영어 학원 시간이에요.", AlarmMemoText.body("영어 학원", "   "))
  }

  @Test fun 메모가_있으면_아래_줄에_붙인다() {
    assertEquals("영어 학원 시간이에요.\n📝 16:45 차 타고 이동", AlarmMemoText.body("영어 학원", " 16:45 차 타고 이동 "))
  }
}
