package com.expensemanagement.alarm

import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Shown full-screen (via the notification's full-screen intent) even over
 * the lock screen, with the phone's alarm sound + vibration — the behavior
 * a plain web push notification can never provide. */
class AlarmActivity : AppCompatActivity() {
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_alarm)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        startAlarmSound()
        startVibration()

        findViewById<Button>(R.id.btnGotIt).setOnClickListener { markTakenAndFinish() }
    }

    private fun startAlarmSound() {
        try {
            val customUri = Prefs.getAlarmToneUri(this)
            val uri = if (customUri != null) Uri.parse(customUri)
                else RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
            ringtone = RingtoneManager.getRingtone(this, uri)
            ringtone?.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            ringtone?.play()
        } catch (e: Exception) {
            // best-effort; vibration + full-screen UI still gets attention
        }
    }

    private fun startVibration() {
        val pattern = longArrayOf(0, 300, 150, 300, 150, 300, 150, 600)
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(VibratorManager::class.java)
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(VIBRATOR_SERVICE) as? Vibrator
        }
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
    }

    private fun stopAlarm() {
        ringtone?.stop()
        vibrator?.cancel()
    }

    private fun markTakenAndFinish() {
        stopAlarm()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                ApiClient.markTodayTakenIfNeeded()
            } catch (e: Exception) {
                // best-effort; user already dismissed the alarm locally either way
            }
        }
        finish()
    }

    override fun onDestroy() {
        stopAlarm()
        super.onDestroy()
    }
}
