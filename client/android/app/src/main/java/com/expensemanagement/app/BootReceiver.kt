package com.expensemanagement.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Exact alarms don't survive a reboot — re-arm both the newspaper and gas alarms. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            AlarmScheduler.scheduleAll(context.applicationContext)
        }
    }
}
