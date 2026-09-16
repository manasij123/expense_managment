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

/**
 * Native Google Sign-In, launched via Google Play Services rather than the
 * WebView. Google actively blocks the OAuth consent screen from loading
 * inside an embedded WebView (the Capacitor JS SDK's signInWithRedirect/
 * signInWithPopup both render there), which is why sign-in used to hang
 * forever on the native build. This plugin gets a Google ID token natively;
 * the JS side then exchanges it for a Firebase credential.
 */
@CapacitorPlugin(name = "GoogleAuth")
class GoogleAuthPlugin : Plugin() {
    private lateinit var client: GoogleSignInClient

    override fun load() {
        val webClientId = context.getString(R.string.default_web_client_id)
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build()
        client = GoogleSignIn.getClient(context, options)
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        saveCall(call)
        startActivityForResult(call, client.signInIntent, "signInResult")
    }

    @ActivityCallback
    private fun signInResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        try {
            val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                .getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (idToken == null) {
                call.reject("Google did not return an ID token.")
                return
            }
            val ret = JSObject()
            ret.put("idToken", idToken)
            call.resolve(ret)
        } catch (e: ApiException) {
            call.reject("Google sign-in failed (code ${e.statusCode})", e)
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        client.signOut().addOnCompleteListener {
            call.resolve()
        }
    }
}
