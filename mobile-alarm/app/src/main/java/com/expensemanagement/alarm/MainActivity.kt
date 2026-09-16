package com.expensemanagement.alarm

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.app.AlarmManager
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.Button
import android.widget.TextView
import android.widget.TimePicker
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

class MainActivity : AppCompatActivity() {

    private lateinit var googleSignInClient: GoogleSignInClient
    private lateinit var statusText: TextView
    private lateinit var alarmTimeTexts: List<TextView>
    private lateinit var signInButton: Button
    private lateinit var skipTodayLabel: TextView
    private lateinit var toneLabel: TextView
    private lateinit var alarmCard: View
    private var pulseAnimator: ValueAnimator? = null
    private val iconPulseAnimators = mutableListOf<ValueAnimator>()

    private val signInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            firebaseAuthWithGoogle(account.idToken!!)
        } catch (e: ApiException) {
            Toast.makeText(this, "Sign-in failed: ${e.statusCode}", Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* status reflected on next onResume */ }

    private val toneLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uri = result.data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
        Prefs.setAlarmToneUri(this, uri?.toString())
        updateToneLabel()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        alarmTimeTexts = listOf(
            findViewById(R.id.alarmTimeText1),
            findViewById(R.id.alarmTimeText2),
            findViewById(R.id.alarmTimeText3)
        )
        signInButton = findViewById(R.id.btnSignIn)
        skipTodayLabel = findViewById(R.id.skipTodayLabel)
        toneLabel = findViewById(R.id.toneLabel)
        alarmCard = findViewById(R.id.cardDailyAlarms)

        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        signInButton.setOnClickListener { signInLauncher.launch(googleSignInClient.signInIntent) }
        findViewById<View>(R.id.alarmRow1).setOnClickListener { showTimePickerDialog(1) }
        findViewById<View>(R.id.alarmRow2).setOnClickListener { showTimePickerDialog(2) }
        findViewById<View>(R.id.alarmRow3).setOnClickListener { showTimePickerDialog(3) }
        findViewById<View>(R.id.cardSkipToday).setOnClickListener { bounce(it); toggleSkipToday() }
        findViewById<View>(R.id.cardSelectTone).setOnClickListener { bounce(it); launchTonePicker() }
        findViewById<View>(R.id.cardMarkTaken).setOnClickListener { bounce(it); markTakenNow() }
        findViewById<View>(R.id.cardTestAlarm).setOnClickListener {
            bounce(it)
            AlarmScheduler.scheduleTestAlarmIn1Minute(this)
            Toast.makeText(this, getString(R.string.test_alarm_in_1_min), Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btnGrantExactAlarm).setOnClickListener { requestExactAlarmPermission() }
        findViewById<Button>(R.id.btnGrantFullScreen).setOnClickListener { requestFullScreenIntentPermission() }

        NotificationHelper.createChannel(this)
        requestNotificationPermissionIfNeeded()

        applyNeonShadows()
        animateEntrance()
    }

    /** Real colored drop-shadows (API 28+) behind each glowing card, so the
     * neon border actually radiates onto the dark background instead of
     * just sitting there as a flat outline. */
    private fun applyNeonShadows() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        fun glow(id: Int, color: Int) {
            findViewById<View>(id).apply {
                outlineAmbientShadowColor = color
                outlineSpotShadowColor = color
            }
        }
        glow(R.id.cardDailyAlarms, ContextCompat.getColor(this, R.color.neon_blue))
        glow(R.id.cardSkipToday, ContextCompat.getColor(this, R.color.amber))
        glow(R.id.cardSelectTone, ContextCompat.getColor(this, R.color.brand_green))
        glow(R.id.cardMarkTaken, ContextCompat.getColor(this, R.color.brand_green))
        glow(R.id.cardTestAlarm, ContextCompat.getColor(this, R.color.brand_indigo))
        glow(R.id.cardPermissions, ContextCompat.getColor(this, R.color.rose))
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        updateAlarmTimeLabel()
        updateSkipButtonLabel()
        updateToneLabel()
    }

    override fun onDestroy() {
        pulseAnimator?.cancel()
        iconPulseAnimators.forEach { it.cancel() }
        super.onDestroy()
    }

    /** Cards pop in with a bouncy overshoot, staggered — turns a static list
     * into a moment instead of everything just appearing at once. */
    private fun animateEntrance() {
        val root = findViewById<View>(android.R.id.content) as? android.view.ViewGroup ?: return
        val scroller = root.getChildAt(0) as? android.view.ViewGroup ?: return
        val container = scroller.getChildAt(0) as? android.view.ViewGroup ?: return

        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            child.alpha = 0f
            child.translationY = 120f
            child.scaleX = 0.85f
            child.scaleY = 0.85f
            child.animate()
                .alpha(1f)
                .translationY(0f)
                .scaleX(1f)
                .scaleY(1f)
                .setStartDelay((i * 80).toLong())
                .setDuration(550)
                .setInterpolator(OvershootInterpolator(1.6f))
                .start()
        }

        val settleDelay = (container.childCount * 80L) + 500L
        alarmCard.postDelayed({ startPulse() }, settleDelay)
        alarmCard.postDelayed({ startIconPulses() }, settleDelay)
    }

    /** A breathing scale + shadow-glow on the daily-alarms card — draws the
     * eye to the single most important piece of information on the screen. */
    private fun startPulse() {
        val scaleX = PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.045f)
        val scaleY = PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.045f)
        val elevation = PropertyValuesHolder.ofFloat(View.TRANSLATION_Z, 0f, 14f)
        pulseAnimator = ObjectAnimator.ofPropertyValuesHolder(alarmCard, scaleX, scaleY, elevation).apply {
            duration = 1200
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            start()
        }
    }

    /** Each action-card icon softly pulses on its own loop, staggered, so the
     * whole grid reads as alive rather than a static screenshot. */
    private fun startIconPulses() {
        val ids = intArrayOf(
            R.id.iconFrameSkip, R.id.iconFrameTone, R.id.iconFrameMarkTaken, R.id.iconFrameTestAlarm
        )
        ids.forEachIndexed { index, id ->
            val view = findViewById<View>(id)
            val scaleX = PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.18f)
            val scaleY = PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.18f)
            val animator = ObjectAnimator.ofPropertyValuesHolder(view, scaleX, scaleY).apply {
                duration = 900
                startDelay = index * 220L
                repeatMode = ValueAnimator.REVERSE
                repeatCount = ValueAnimator.INFINITE
            }
            iconPulseAnimators.add(animator)
            animator.start()
        }
    }

    private fun bounce(view: View) {
        view.animate().scaleX(0.95f).scaleY(0.95f).setDuration(80).withEndAction {
            view.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
        }.start()
    }

    private fun updateStatus() {
        val user = FirebaseAuth.getInstance().currentUser
        if (user != null) {
            signInButton.visibility = View.GONE
            statusText.text = getString(R.string.status_signed_in, user.displayName ?: user.email ?: "")
            AlarmScheduler.scheduleUserAlarms(this)
        } else {
            signInButton.visibility = View.VISIBLE
            statusText.text = getString(R.string.status_signed_out)
        }
    }

    private fun updateAlarmTimeLabel() {
        for (slot in 1..AlarmScheduler.SLOT_COUNT) {
            val hour = Prefs.getAlarmHour(this, slot)
            val minute = Prefs.getAlarmMinute(this, slot)
            val calendar = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, minute)
            }
            alarmTimeTexts[slot - 1].text = android.text.format.DateFormat.format("h:mm a", calendar)
        }
    }

    private fun updateSkipButtonLabel() {
        skipTodayLabel.text = if (Prefs.isTodaySkipped(this)) {
            getString(R.string.skipped_today)
        } else {
            getString(R.string.skip_today)
        }
    }

    private fun updateToneLabel() {
        val uriString = Prefs.getAlarmToneUri(this)
        val name = if (uriString == null) {
            "Default"
        } else {
            try {
                RingtoneManager.getRingtone(this, Uri.parse(uriString))?.getTitle(this) ?: "Custom"
            } catch (e: Exception) {
                "Custom"
            }
        }
        toneLabel.text = name
    }

    private fun showTimePickerDialog(slot: Int) {
        val view = layoutInflater.inflate(R.layout.dialog_time_picker, null)
        val timePicker = view.findViewById<TimePicker>(R.id.timePicker)
        timePicker.setIs24HourView(false)
        timePicker.hour = Prefs.getAlarmHour(this, slot)
        timePicker.minute = Prefs.getAlarmMinute(this, slot)

        val dialog = AlertDialog.Builder(this)
            .setView(view)
            .create()

        view.findViewById<Button>(R.id.btnOkTime).setOnClickListener {
            Prefs.setAlarmHour(this, slot, timePicker.hour)
            Prefs.setAlarmMinute(this, slot, timePicker.minute)
            AlarmScheduler.scheduleSlot(this, slot)
            updateAlarmTimeLabel()
            dialog.dismiss()
        }
        view.findViewById<Button>(R.id.btnCancelTime).setOnClickListener { dialog.dismiss() }

        dialog.show()
    }

    private fun toggleSkipToday() {
        if (Prefs.isTodaySkipped(this)) {
            Prefs.setSkipDate(this, null)
        } else {
            Prefs.setSkipDate(this, Prefs.todayString())
        }
        updateSkipButtonLabel()
    }

    private fun launchTonePicker() {
        val current = Prefs.getAlarmToneUri(this)
        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            putExtra(
                RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,
                RingtoneManager.getActualDefaultRingtoneUri(this@MainActivity, RingtoneManager.TYPE_ALARM)
            )
            putExtra(
                RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                if (current != null) Uri.parse(current) else null
            )
        }
        toneLauncher.launch(intent)
    }

    private fun firebaseAuthWithGoogle(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        FirebaseAuth.getInstance().signInWithCredential(credential)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    updateStatus()
                } else {
                    Toast.makeText(this, "Authentication failed", Toast.LENGTH_LONG).show()
                }
            }
    }

    private fun requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = getSystemService(ALARM_SERVICE) as AlarmManager
            if (!alarmManager.canScheduleExactAlarms()) {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
                )
            } else {
                Toast.makeText(this, "Already granted", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(this, "Not needed on this Android version", Toast.LENGTH_SHORT).show()
        }
    }

    private fun requestFullScreenIntentPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivity(
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))
            )
        } else {
            Toast.makeText(this, "Not needed on this Android version", Toast.LENGTH_SHORT).show()
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun markTakenNow() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val didMark = ApiClient.markTodayTakenIfNeeded()
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@MainActivity,
                        if (didMark) "Marked as taken!" else getString(R.string.already_taken),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
