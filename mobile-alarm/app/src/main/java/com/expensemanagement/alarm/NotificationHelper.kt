package com.expensemanagement.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.provider.Settings

object NotificationHelper {
    const val CHANNEL_ID = "newspaper_alarm_channel"

    /** Configured with USAGE_ALARM so it can ring even when the phone is on
     * silent / Do Not Disturb — the whole reason this app exists instead of
     * relying on a regular web push notification. */
    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val audioAttributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_ALARM)
            .build()

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Newspaper Alarm",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Daily newspaper delivery reminder alarm"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 300, 150, 300, 150, 300, 150, 600)
            setSound(Settings.System.DEFAULT_ALARM_ALERT_URI, audioAttributes)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }
}
