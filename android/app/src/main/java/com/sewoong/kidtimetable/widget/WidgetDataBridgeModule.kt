package com.sewoong.kidtimetable.widget

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetDataBridgeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WidgetDataBridge"
  @ReactMethod fun writeWidgetData(payload: String, promise: Promise) = try {
    WidgetDataStore.write(context, payload)
    WidgetRefreshScheduler.scheduleNext(context, WidgetSnapshotParser.parse(payload))
    val manager = android.appwidget.AppWidgetManager.getInstance(context)
    val provider = android.content.ComponentName(context, TodayWidgetProvider::class.java)
    TodayWidgetProvider().onUpdate(context, manager, manager.getAppWidgetIds(provider))
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("WIDGET_DATA_WRITE_FAILED", error) }
}
