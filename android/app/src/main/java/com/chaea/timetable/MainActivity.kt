package com.chaea.timetable
import expo.modules.splashscreen.SplashScreenManager

import android.content.Intent
import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.chaea.timetable.alarm.AlarmHandoff

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    applyShowWhenLockedIfFromAlarm(intent)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // getIntent()는 onNewIntent만으로는 갱신되지 않는다. 이걸 빼먹으면 앱이 이미 떠 있을 때
    // RN Linking/expo-router가 새 딥링크 URL을 못 읽어서 마지막 화면에 그대로 머문다.
    setIntent(intent)
    applyShowWhenLockedIfFromAlarm(intent)
  }

  override fun onStop() {
    super.onStop()
    // onResume()에서 바로 끄면 알람에서 넘어오는 바로 그 전환 도중에 꺼져 버려서 키가드가
    // 다시 앞으로 올라온다. 화면을 완전히 벗어난 뒤(onStop)에만 평소 상태로 되돌린다.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(false)
      setTurnScreenOn(false)
    }
  }

  private fun applyShowWhenLockedIfFromAlarm(intent: Intent?) {
    // 외부 앱이 흉내 낼 수 없는 일회용 토큰만 인정한다 — extra 값 자체(예: boolean true)는
    // exported 액티비티에 누구나 실어 보낼 수 있어 잠금화면 우회의 근거가 될 수 없다.
    val token = intent?.getStringExtra("alarmHandoffToken")
    intent?.removeExtra("alarmHandoffToken")
    if (!AlarmHandoff.consume(token)) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
