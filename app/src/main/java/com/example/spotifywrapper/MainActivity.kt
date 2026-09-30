package com.example.spotifywrapper

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val startUrl = "https://open.spotify.com/"
    private val jsCache = mutableMapOf<String, String>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Foreground service keeps the process alive so WebView audio continues.
        ContextCompat.startForegroundService(
            this, Intent(this, PlaybackService::class.java)
        )

        requestNotificationPermissionIfNeeded()

        webView = findViewById(R.id.webview)
        setupWebView()
        webView.loadUrl(startUrl)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.javaScriptCanOpenWindowsAutomatically = true
        s.setSupportMultipleWindows(false)
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.userAgentString = s.userAgentString + " SpotifyWrapper/1.0"

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView, req: WebResourceRequest
            ): Boolean {
                val host = req.url.host ?: return false
                val internal = host.endsWith("spotify.com") ||
                               host.endsWith("spotidown.app") ||
                               host.endsWith("scdn.co") ||
                               host.endsWith("spotifycdn.com")
                if (!internal) {
                    startActivity(Intent(Intent.ACTION_VIEW, req.url))
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectScripts(view)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }

        webView.setDownloadListener { url, ua, disposition, mime, _ ->
            enqueueDownload(url, ua, disposition, mime)
        }
    }

    private fun injectScripts(view: WebView) {
        listOf("background_play.js", "declutter.js", "spotidown.js").forEach { name ->
            val js = jsCache.getOrPut(name) {
                assets.open(name).bufferedReader().use { it.readText() }
            }
            view.evaluateJavascript(js, null)
        }
    }

    private fun enqueueDownload(
        url: String, userAgent: String, contentDisposition: String, mime: String
    ) {
        try {
            val filename = guessFilename(url, contentDisposition, mime)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mime)
                addRequestHeader("User-Agent", userAgent)
                CookieManager.getInstance().getCookie(url)?.let {
                    addRequestHeader("Cookie", it)
                }
                setTitle(filename)
                setDescription("Downloading from SpotiDown…")
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS, filename
                )
                allowScanningByMediaScanner()
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager)
                .enqueue(request)

            Toast.makeText(
                this, "Saving to /sdcard/Download/$filename", Toast.LENGTH_LONG
            ).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun guessFilename(url: String, cd: String, mime: String): String {
        var name = URLUtil.guessFileName(url, cd, mime)
        if (!name.contains('.')) {
            name += when {
                mime.contains("audio", true) -> ".mp3"
                mime.contains("video", true) -> ".mp4"
                else -> ".bin"
            }
        }
        return name
    }
}
