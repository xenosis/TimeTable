package com.chaea.timetable.push

import org.junit.Assert.*
import org.junit.Test

class FamilyPushPolicyTest {
  @Test fun `완료 푸시는 같은 가족 아빠에게만 보이며 다른 종류는 차단한다`() {
    assertTrue(FamilyPushPolicy.completionIsToday("2026-10-11", "2026-10-11"))
    assertFalse(FamilyPushPolicy.completionIsToday("2026-10-10", "2026-10-11"))
    assertFalse(FamilyPushPolicy.completionIsToday(null, "2026-10-11"))
    assertTrue(FamilyPushPolicy.shouldShow("a", "a", true, "tasks-completed"))
    assertFalse(FamilyPushPolicy.shouldShow("a", "a", false, "tasks-completed"))
    assertFalse(FamilyPushPolicy.shouldShow("a", "b", true, "tasks-completed"))
    assertFalse(FamilyPushPolicy.shouldShow(null, "a", true, "tasks-completed"))
    assertFalse(FamilyPushPolicy.shouldShow("a", "a", true, "other"))
    assertEquals("a", FamilyPushPolicy.messageFamily(mapOf("type" to "tasks-completed", "familyId" to "a")))
    assertEquals("tasks-completed", FamilyPushPolicy.messageType(mapOf("body" to "{\"type\":\"tasks-completed\"}")))
  }
  @Test fun `이미 표시했거나 더 오래된 변경은 다시 표시하지 않는다`() {
    assertTrue(FamilyPushPolicy.isNewer(12, 11))
    assertFalse(FamilyPushPolicy.isNewer(11, 11))
    assertFalse(FamilyPushPolicy.isNewer(10, 11))
    assertFalse(FamilyPushPolicy.isNewer(null, 0))
    assertFalse(FamilyPushPolicy.isNewer(0, 0))
    assertEquals(12L, FamilyPushPolicy.messageOrder(mapOf("body" to "{\"changeOrder\":12}")))
    assertEquals(12L, FamilyPushPolicy.messageOrder(mapOf("changeOrder" to "12")))
    assertNull(FamilyPushPolicy.messageOrder(mapOf("changeOrder" to "1.2")))
    assertNull(FamilyPushPolicy.messageOrder(mapOf("changeOrder" to "-1")))
  }
  @Test fun `현재 딸 가족 메시지만 표시한다`() {
    assertTrue(FamilyPushPolicy.shouldShow("a", "a", false))
    assertFalse(FamilyPushPolicy.shouldShow("a", "b", false))
    assertFalse(FamilyPushPolicy.shouldShow(null, "a", false))
    assertFalse(FamilyPushPolicy.shouldShow("a", "a", true))
    assertFalse(FamilyPushPolicy.shouldShow("a", null, false))
  }
  @Test fun `Expo body의 가족과 종류를 검증한다`() {
    assertEquals("a", FamilyPushPolicy.messageFamily(mapOf("body" to "{\"type\":\"family-change\",\"familyId\":\"a\"}")))
    assertEquals("a", FamilyPushPolicy.messageFamily(mapOf("type" to "family-change", "familyId" to "a")))
    assertNull(FamilyPushPolicy.messageFamily(mapOf("body" to "invalid")))
    assertNull(FamilyPushPolicy.messageFamily(mapOf("type" to "other", "familyId" to "a")))
    assertNull(FamilyPushPolicy.messageFamily(mapOf("type" to "family-change", "familyId" to "")))
  }
}
