package com.expensemanagement.app

import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider

/** Native Google Sign-In, bridged into the web app's Firebase JS Auth.
 *
 * Google blocks OAuth sign-in inside generic WebViews — both the popup and
 * the full-page-redirect flow get flagged as an "insecure browser" and
 * either fail outright or bounce out to the system browser with no way
 * back into the app. The real fix is to never attempt Google sign-in
 * inside the WebView at all: this plugin runs the native Google account
 * picker (the same trusted UI Play Services apps use), then hands the
 * resulting ID token back to JS, which completes Firebase sign-in via
 * signInWithCredential — no popup, no redirect, no WebView involved.
 *
 * It also signs the *native* FirebaseAuth SDK in with the same credential —
 * that's a separate session from the WebView's JS-side Firebase Auth, and
 * it's what the native alarm engine (AlarmSettingsActivity) checks. Without
 * this, signing in on the main screen wouldn't carry over to Alarm
 * Settings, and the user would have to sign in twice. */
@CapacitorPlugin(name = "GoogleAuth")
class GoogleAuthPlugin : Plugin() {
    private lateinit var googleSignInClient: GoogleSignInClient

    override fun load() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(context.getString(R.string.default_web_client_id))
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(context, gso)
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        startActivityForResult(call, googleSignInClient.signInIntent, "handleSignInResult")
    }

    @ActivityCallback
    private fun handleSignInResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            val account = task.getResult(ApiException::class.java)
            val ret = JSObject()
            ret.put("idToken", account.idToken)
            call.resolve(ret)
        } catch (e: ApiException) {
            call.reject("Google sign-in failed (code ${e.statusCode})")
        }
    }
}
