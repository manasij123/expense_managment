package com.expensemanagement.app

import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Bridges the web app (running in the Capacitor WebView) to the native
 * newspaper-alarm engine — reliable exact alarms and lock-screen wake that
 * a web page alone can't do. Called from React via
 * `Capacitor.Plugins.AlarmSettings.open()`. */
@CapacitorPlugin(name = "AlarmSettings")
class AlarmPlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        val intent = Intent(context, AlarmSettingsActivity::class.java)
        activity.startActivity(intent)
        call.resolve()
    }
}
