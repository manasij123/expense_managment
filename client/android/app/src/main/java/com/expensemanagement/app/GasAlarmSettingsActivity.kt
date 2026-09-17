package com.expensemanagement.app

import android.Manifest
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
import java.util.Calendar

/** Dedicated native alarm screen for the gas cylinder check-in — kept
 * separate from AlarmSettingsActivity (newspaper) on purpose, so each
 * feature's alarm lives where that feature lives (Gas Expense page vs.
 * Newspaper Tracker page) instead of one combined screen. */
class GasAlarmSettingsActivity : AppCompatActivity() {

    private lateinit var googleSignInClient: GoogleSignInClient
    private lateinit var statusText: TextView
    private lateinit var gasAlarmTimeText: TextView
    private lateinit var signInButton: Button
    private lateinit var toneLabel: TextView

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
        setContentView(R.layout.activity_gas_alarm)

        statusText = findViewById(R.id.statusText)
        gasAlarmTimeText = findViewById(R.id.gasAlarmTimeText)
        signInButton = findViewById(R.id.btnSignIn)
        toneLabel = findViewById(R.id.toneLabel)

        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        signInButton.setOnClickListener { signInLauncher.launch(googleSignInClient.signInIntent) }
        findViewById<View>(R.id.gasAlarmRow).setOnClickListener { showGasTimePickerDialog() }
        findViewById<View>(R.id.cardSelectTone).setOnClickListener { bounce(it); launchTonePicker() }
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

    private fun applyNeonShadows() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        fun glow(id: Int, color: Int) {
            findViewById<View>(id).apply {
                outlineAmbientShadowColor = color
                outlineSpotShadowColor = color
            }
        }
        glow(R.id.cardGasAlarm, ContextCompat.getColor(this, R.color.rose))
        glow(R.id.cardSelectTone, ContextCompat.getColor(this, R.color.brand_green))
        glow(R.id.cardTestAlarm, ContextCompat.getColor(this, R.color.brand_indigo))
        glow(R.id.cardPermissions, ContextCompat.getColor(this, R.color.rose))
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        updateGasAlarmTimeLabel()
        updateToneLabel()
    }

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
            AlarmScheduler.scheduleGasAlarm(this)
        } else {
            signInButton.visibility = View.VISIBLE
            statusText.text = getString(R.string.status_signed_out)
        }
    }

    private fun updateGasAlarmTimeLabel() {
        val hour = Prefs.getGasAlarmHour(this)
        val minute = Prefs.getGasAlarmMinute(this)
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
        }
        gasAlarmTimeText.text = android.text.format.DateFormat.format("h:mm a", calendar)
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

    private fun showGasTimePickerDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_time_picker, null)
        val timePicker = view.findViewById<TimePicker>(R.id.timePicker)
        timePicker.setIs24HourView(false)
        timePicker.hour = Prefs.getGasAlarmHour(this)
        timePicker.minute = Prefs.getGasAlarmMinute(this)

        val dialog = AlertDialog.Builder(this)
            .setView(view)
            .create()

        view.findViewById<Button>(R.id.btnOkTime).setOnClickListener {
            Prefs.setGasAlarmHour(this, timePicker.hour)
            Prefs.setGasAlarmMinute(this, timePicker.minute)
            AlarmScheduler.scheduleGasAlarm(this)
            updateGasAlarmTimeLabel()
            dialog.dismiss()
        }
        view.findViewById<Button>(R.id.btnCancelTime).setOnClickListener { dialog.dismiss() }

        dialog.show()
    }

    private fun launchTonePicker() {
        val current = Prefs.getAlarmToneUri(this)
        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            putExtra(
                RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,
                RingtoneManager.getActualDefaultRingtoneUri(this@GasAlarmSettingsActivity, RingtoneManager.TYPE_ALARM)
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
}
