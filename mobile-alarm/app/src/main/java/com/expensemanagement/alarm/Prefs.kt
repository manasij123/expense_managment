package com.expensemanagement.alarm

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Small SharedPreferences wrapper for the user's alarm settings — three
 * independently-configurable daily alarm slots, their picked tone, and
 * today's optional "skip" flag. */
object Prefs {
    private const val FILE = "newspaper_alarm_prefs"
    private const val KEY_TONE_URI = "alarm_tone_uri"
    private const val KEY_SKIP_DATE = "skip_date"

    // Matches the app's original three fixed slots, so upgrading doesn't
    // silently change behavior for anyone already relying on them.
    private val DEFAULT_HOURS = intArrayOf(12, 15, 16)
    private val DEFAULT_MINUTES = intArrayOf(30, 0, 0)

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun getAlarmHour(context: Context, slot: Int): Int =
        prefs(context).getInt("alarm_hour_$slot", DEFAULT_HOURS[slot - 1])
    fun setAlarmHour(context: Context, slot: Int, value: Int) {
        prefs(context).edit().putInt("alarm_hour_$slot", value).apply()
    }

    fun getAlarmMinute(context: Context, slot: Int): Int =
        prefs(context).getInt("alarm_minute_$slot", DEFAULT_MINUTES[slot - 1])
    fun setAlarmMinute(context: Context, slot: Int, value: Int) {
        prefs(context).edit().putInt("alarm_minute_$slot", value).apply()
    }

    fun getAlarmToneUri(context: Context): String? = prefs(context).getString(KEY_TONE_URI, null)
    fun setAlarmToneUri(context: Context, value: String?) {
        prefs(context).edit().putString(KEY_TONE_URI, value).apply()
    }

    fun getSkipDate(context: Context): String? = prefs(context).getString(KEY_SKIP_DATE, null)
    fun setSkipDate(context: Context, value: String?) {
        prefs(context).edit().putString(KEY_SKIP_DATE, value).apply()
    }

    fun todayString(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun isTodaySkipped(context: Context): Boolean = getSkipDate(context) == todayString()
}
