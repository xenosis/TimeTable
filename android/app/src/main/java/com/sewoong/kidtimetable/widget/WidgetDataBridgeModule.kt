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
    WidgetUpdater.updateAll(context) // 일정·할 일 위젯을 함께 다시 그린다
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("WIDGET_DATA_WRITE_FAILED", error) }

  /** 위젯에서 누른 체크를 읽는다(지우지 않는다). 앱이 같은 규칙으로 DB에 기록한 뒤 [ackPendingChecks]로 지운다. */
  @ReactMethod fun peekPendingChecks(promise: Promise) = try {
    promise.resolve(WidgetCheckStore.peek(context))
  } catch (error: Exception) { promise.reject("WIDGET_PENDING_READ_FAILED", error) }

  /** 앱이 DB에 기록한 체크(JSON 배열)만 대기 목록에서 지운다. 그 사이 새로 눌린 체크는 남는다. */
  @ReactMethod fun ackPendingChecks(applied: String, promise: Promise) = try {
    WidgetCheckStore.ack(context, applied)
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("WIDGET_PENDING_ACK_FAILED", error) }
}
