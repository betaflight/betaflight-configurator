@file:Suppress("unused")

package com.betaflight.dfu

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.webkit.WebView
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin

@TauriPlugin
class DfuPlugin(private val activity: Activity) : Plugin(activity) {
    private lateinit var bridge: DfuFdBridge
    private var destroyCb: Application.ActivityLifecycleCallbacks? = null

    override fun load(webView: WebView) {
        super.load(webView)
        bridge = DfuFdBridge(activity.applicationContext)
        DfuNative.bind(bridge)
        val app = activity.application
        destroyCb = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityDestroyed(a: Activity) {
                if (a !== activity) return
                bridge.shutdown()
                app.unregisterActivityLifecycleCallbacks(this)
                destroyCb = null
            }
            // Only destruction matters here; the interface requires the rest.
            override fun onActivityCreated(a: Activity, s: Bundle?) { /* unused */ }
            override fun onActivityStarted(a: Activity) { /* unused */ }
            override fun onActivityResumed(a: Activity) { /* unused */ }
            override fun onActivityPaused(a: Activity) { /* unused */ }
            override fun onActivityStopped(a: Activity) { /* unused */ }
            override fun onActivitySaveInstanceState(a: Activity, s: Bundle) { /* unused */ }
        }
        app.registerActivityLifecycleCallbacks(destroyCb!!)
    }
}
