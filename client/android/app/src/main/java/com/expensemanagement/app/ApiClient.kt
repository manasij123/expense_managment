package com.expensemanagement.app

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Talks to the same deployed Cloud Function the React web app uses
 * (functions/api.py), authenticating with a fresh Firebase ID token per
 * request instead of a browser session cookie.
 */
object ApiClient {
    private const val BASE_URL = "https://expensemanagement-178bf.web.app"
    private val client = OkHttpClient()

    private suspend fun freshIdToken(): String {
        val user = FirebaseAuth.getInstance().currentUser
            ?: throw IllegalStateException("Not signed in")
        return suspendCancellableCoroutine { cont ->
            user.getIdToken(true)
                .addOnSuccessListener { result ->
                    val token = result.token
                    if (token != null) cont.resume(token)
                    else cont.resumeWithException(IllegalStateException("No ID token returned"))
                }
                .addOnFailureListener { e -> cont.resumeWithException(e) }
        }
    }

    suspend fun getNewspaperStatus(): JSONObject {
        val token = freshIdToken()
        val request = Request.Builder()
            .url("$BASE_URL/api/newspaper")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        return executeJson(request)
    }

    /** Marks today taken, but only if it isn't already — avoids accidentally
     * un-marking a day that was already confirmed via the web app, since the
     * backend endpoint is a plain toggle, not a "set true". */
    suspend fun markTodayTakenIfNeeded(): Boolean {
        val status = getNewspaperStatus()
        val record = status.optJSONObject("record")
        val daysTaken = record?.optJSONObject("days_taken")
        val dayKey = SimpleDateFormat("d", Locale.US).format(Date())
        val alreadyTaken = daysTaken?.optBoolean(dayKey, false) ?: false
        if (alreadyTaken) return false

        val year = SimpleDateFormat("yyyy", Locale.US).format(Date())
        val month = SimpleDateFormat("M", Locale.US).format(Date())
        val day = SimpleDateFormat("d", Locale.US).format(Date())
        val token = freshIdToken()
        val request = Request.Builder()
            .url("$BASE_URL/api/newspaper/toggle/$year-$month-$day")
            .header("Authorization", "Bearer $token")
            .post("".toRequestBody(null))
            .build()
        executeJson(request)
        return true
    }

    /** Whether the gas cylinder check-in is actually due right now — mirrors
     * the same is_check_due logic the web app's Gas Expense page uses, so the
     * native alarm only rings when there's really something to ask about. */
    suspend fun isGasCheckInDue(): Boolean {
        val token = freshIdToken()
        val request = Request.Builder()
            .url("$BASE_URL/api/gas")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val status = executeJson(request)
        return status.optBoolean("is_check_due", false)
    }

    private suspend fun executeJson(request: Request): JSONObject =
        suspendCancellableCoroutine { cont ->
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val bodyString = it.body?.string() ?: "{}"
                        try {
                            cont.resume(JSONObject(bodyString))
                        } catch (e: Exception) {
                            cont.resumeWithException(e)
                        }
                    }
                }
            })
        }
}
