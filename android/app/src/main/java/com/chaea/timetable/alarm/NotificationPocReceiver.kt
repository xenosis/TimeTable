package com.chaea.timetable.alarm
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
class NotificationPocReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) = NotificationPocScheduler.deliver(context) }
