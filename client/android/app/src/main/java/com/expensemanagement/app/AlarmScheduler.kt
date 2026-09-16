package com.expensemanagement.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar

/** Schedules both the newspaper alarms (three independently-configurable
 * daily slots) and the gas cylinder check-in alarm (one daily slot) as real
 * device-local exact alarms — fire even offline and can bypass silent mode. */
object AlarmScheduler {
    const val SLOT_COUNT = 3
    private const val REQ_USER_ALARM_BASE = 100
    private const val REQ_GAS_ALARM = 200
    private const val REQ_TEST = 9999

    fun scheduleAll(context: Context) {
        scheduleUserAlarms(context)
        scheduleGasAlarm(context)
    }

    fun scheduleUserAlarms(context: Context) {
        for (slot in 1..SLOT_COUNT) scheduleSlot(context, slot)
    }

    fun scheduleSlot(context: Context, slot: Int) {
        val hour = Prefs.getAlarmHour(context, slot)
        val minute = Prefs.getAlarmMinute(context, slot)

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("type", "newspaper")
            putExtra("slot", slot)
        }
        scheduleExact(context, hour, minute, REQ_USER_ALARM_BASE + slot, intent)
    }

    fun scheduleGasAlarm(context: Context) {
        val hour = Prefs.getGasAlarmHour(context)
        val minute = Prefs.getGasAlarmMinute(context)

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("type", "gas")
        }
        scheduleExact(context, hour, minute, REQ_GAS_ALARM, intent)
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

    private fun scheduleExact(context: Context, hour: Int, minute: Int, requestCode: Int, intent: Intent) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerTime = nextOccurrence(hour, minute)

        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
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
