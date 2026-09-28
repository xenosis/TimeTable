package com.sewoong.kidtimetable.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.sewoong.kidtimetable.MainActivity

/** A keyguard-safe alarm surface. Sound and the persistent notification live in
 * AlarmSoundService so a config change, back press, or this Activity's own recreation never
 * silently stops the alarm — only the explicit "끄기" button (here or in the notification) does.
 * This activity has its own taskAffinity (see manifest), so once MainActivity's task comes to
 * front this one is stopped by the system — onStop() then finishes it without guessing a delay. */
class AlarmActivity : Activity() {
  private var scheduleId: String = "unknown"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    current = this
    scheduleId = intent.getStringExtra("scheduleId") ?: "unknown"
    setContentView(createContent())
  }

  override fun onNewIntent(newIntent: Intent) {
    super.onNewIntent(newIntent)
    intent = newIntent
    current = this
    scheduleId = newIntent.getStringExtra("scheduleId") ?: "unknown"
    setContentView(createContent())
  }

  override fun onStop() {
    super.onStop()
    // 사용자가 홈으로 나가도, 넘겨준 MainActivity가 앞으로 와도 이 화면은 더 필요 없다.
    // 소리는 AlarmSoundService가 별도로 들고 있으니 여기서 finish해도 알람은 안 꺼진다.
    finish()
  }

  override fun onDestroy() {
    if (current === this) current = null
    super.onDestroy()
  }

  /** Only the "끄기" button may dismiss the alarm; back press must not silently stop it. */
  override fun onBackPressed() { /* intentionally ignored */ }

  private fun createContent(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    setPadding(dp(32), dp(32), dp(32), dp(32))
    setBackgroundColor(0xFFFFF7ED.toInt())

    addView(TextView(context).apply {
      text = AlarmNavigation.displayTitle(scheduleId, isAlarm = true)
      textSize = 32f
      gravity = Gravity.CENTER
      setTextColor(0xFF3B1D63.toInt())
    })
    addView(TextView(context).apply {
      text = "${intent.getStringExtra("title") ?: "할 일"} 시간이에요."
      textSize = 20f
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(32))
      setTextColor(0xFF3B1D63.toInt())
    })
    addView(Button(context).apply {
      text = "끄기"
      textSize = 22f
      minHeight = dp(64)
      setOnClickListener { turnOffAndFinish() }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    addView(Button(context).apply {
      text = "일정 보기"
      textSize = 18f
      minHeight = dp(56)
      setOnClickListener { turnOffAndOpenSchedule() }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
  }

  private fun turnOffAndFinish() {
    AlarmSoundService.stop(this)
    finish()
  }

  private fun turnOffAndOpenSchedule() {
    AlarmSoundService.stop(this)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { openScheduleAndFinish(); return }
    val keyguard = getSystemService(KEYGUARD_SERVICE) as? KeyguardManager
    if (keyguard?.isKeyguardLocked != true) { openScheduleAndFinish(); return }
    // finish()가 잠금 해제 요청보다 먼저 실행되면 시스템이 요청 자체를 취소해 버려서
    // MainActivity가 잠금화면 뒤에 숨는다. 해제가 실제로 끝난 뒤에만 화면을 넘긴다.
    keyguard.requestDismissKeyguard(
      this,
      object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = openScheduleAndFinish()
        override fun onDismissCancelled() = finish()
        override fun onDismissError() = finish()
      },
    )
  }

  private fun openScheduleAndFinish() {
    startActivity(
      Intent(Intent.ACTION_VIEW, AlarmNavigation.deepLinkUri(scheduleId))
        .setClass(this, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        // 화면이 꺼진 채 잠겨 있던 상태에서 넘어올 때는 MainActivity도 잠깐 잠금화면 위에 뜰 수
        // 있어야 한다. 위조 방지를 위해 매번 새로 발급하는 일회용 토큰으로만 허용한다.
        .putExtra("alarmHandoffToken", AlarmHandoff.issue()),
    )
    // 이 액티비티는 별도 taskAffinity라 MainActivity 태스크가 앞으로 오면 곧 stop되고,
    // onStop()에서 finish한다 — 타이밍에 기대는 지연 없이 안전하게 정리된다.
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    @Volatile private var current: AlarmActivity? = null

    /** 알림의 "끄기" 액션처럼 이 화면 밖에서 알람을 끌 때도 떠 있는 전체화면을 함께 닫는다. */
    fun finishIfShowing() { current?.finish() }
  }
}
