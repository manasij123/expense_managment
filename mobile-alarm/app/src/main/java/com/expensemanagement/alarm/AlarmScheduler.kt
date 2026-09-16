package com.expensemanagement.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar

/** Schedules the user's three independently-configurable daily alarms (set
 * via MainActivity's time pickers, stored in Prefs) as real device-local
 * exact alarms — fire even offline and can bypass silent mode. */
object AlarmScheduler {
    const val SLOT_COUNT = 3
    private const val REQ_USER_ALARM_BASE = 100
    private const val REQ_TEST = 9999

    fun scheduleUserAlarms(context: Context) {
        for (slot in 1..SLOT_COUNT) scheduleSlot(context, slot)
    }

    fun scheduleSlot(context: Context, slot: Int) {
        val hour = Prefs.getAlarmHour(context, slot)
        val minute = Prefs.getAlarmMinute(context, slot)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerTime = nextOccurrence(hour, minute)

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("slot", slot)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, REQ_USER_ALARM_BASE + slot, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S &&
            !alarmManager.canScheduleExactAlarms()
        ) {
            // Permission not granted yet — MainActivity prompts for this;
            // fall back to an inexact alarm so something still fires.
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            return
        }
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
    }

    fun scheduleTestAlarmIn1Minute(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerTime = System.currentTimeMillis() + 60_000

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("isTest", true)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, REQ_TEST, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
    }

    private fun nextOccurrence(hour: Int, minute: Int): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (target.timeInMillis <= now.timeInMillis) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }
        return target.timeInMillis
    }
}
