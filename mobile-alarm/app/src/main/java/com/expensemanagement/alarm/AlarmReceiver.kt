package com.expensemanagement.alarm

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val isTest = intent.getBooleanExtra("isTest", false)
        val slot = intent.getIntExtra("slot", 0)
        val appContext = context.applicationContext

        // Network call needed before deciding whether to ring — goAsync() lets
        // the receiver keep running briefly in the background for this.
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                handleAlarm(appContext, isTest)
            } finally {
                if (!isTest && slot != 0) {
                    // Alarms are one-shot; re-arm this slot's tomorrow occurrence.
                    AlarmScheduler.scheduleSlot(appContext, slot)
                }
                pendingResult.finish()
            }
        }
    }

    private suspend fun handleAlarm(context: Context, isTest: Boolean) {
        // "Skip today" wins over everything else — self-expiring, so it only
        // ever silences the alarm for the one day it was set for.
        if (!isTest && Prefs.isTodaySkipped(context)) {
            Prefs.setSkipDate(context, null)
            return
        }

        val isTaken = try {
            val status = ApiClient.getNewspaperStatus()
            val record = status.optJSONObject("record")
            val daysTaken = record?.optJSONObject("days_taken")
            val dayKey = SimpleDateFormat("d", Locale.US).format(Date())
            daysTaken?.optBoolean(dayKey, false) ?: false
        } catch (e: Exception) {
            false // can't reach the server — ring anyway, better to over-notify than miss it
        }

        if (isTaken && !isTest) return
        showFullScreenAlarm(context)
    }

    private fun showFullScreenAlarm(context: Context) {
        NotificationHelper.createChannel(context)

        val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(context.getString(R.string.alarm_title))
            .setContentText(context.getString(R.string.alarm_body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(1001, notification)
    }
}
