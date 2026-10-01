package com.sewoong.kidtimetable.alarm

/** 알림·잠금 화면 알람에 보이는 본문. 메모가 있으면 한 줄 아래에 붙인다. 안드로이드 API를 쓰지 않아 JUnit으로 검증한다. */
object AlarmMemoText {
  fun body(title: String, memo: String): String {
    val base = "$title 시간이에요."
    val trimmed = memo.trim()
    return if (trimmed.isEmpty()) base else "$base\n📝 $trimmed"
  }
}
