package com.expensemanagement.app

import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Bridges the web app (running in the Capacitor WebView) to the native
 * alarm engine — reliable exact alarms and lock-screen wake that a web page
 * alone can't do. Newspaper and gas each get their own screen, called from
 * React via `Capacitor.Plugins.AlarmSettings.open()` /
 * `.openGasAlarm()` respectively — kept separate on purpose, each living
 * next to the feature it belongs to. */
@CapacitorPlugin(name = "AlarmSettings")
class AlarmPlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        val intent = Intent(context, AlarmSettingsActivity::class.java)
        activity.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun openGasAlarm(call: PluginCall) {
        val intent = Intent(context, GasAlarmSettingsActivity::class.java)
        activity.startActivity(intent)
        call.resolve()
    }
}
