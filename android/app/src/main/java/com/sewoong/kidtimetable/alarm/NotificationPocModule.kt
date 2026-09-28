package com.sewoong.kidtimetable.alarm
import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
class NotificationPocModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) { override fun getName() = "NotificationPoc"; @ReactMethod fun schedule(delayMilliseconds: Double, promise: Promise) { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { promise.resolve(null); return }; if (!(context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()) { promise.resolve(null); return }; val triggerAt = System.currentTimeMillis() + delayMilliseconds.toLong(); NotificationPocScheduler.schedule(context, triggerAt); promise.resolve(Arguments.createMap().apply { putString("notificationId", "timetable-poc") }) } }
