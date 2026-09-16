package com.expensemanagement.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Exact alarms don't survive a reboot — re-arm the user's daily alarms. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            AlarmScheduler.scheduleUserAlarms(context.applicationContext)
        }
    }
}
