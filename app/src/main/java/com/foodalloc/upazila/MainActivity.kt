package com.foodalloc.upazila

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import com.google.android.material.button.MaterialButton
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: LinearLayout
    private lateinit var retryButton: MaterialButton
    private lateinit var assetLoader: WebViewAssetLoader

    private val initialUrl = "https://appassets.androidplatform.net/index.html"
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var pendingAuthCallbackJson: String? = null
    private var isPageLoaded = false

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileUploadCallback
            fileUploadCallback = null
            if (callback == null) return@registerForActivityResult
            val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
            callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val rootContainer = findViewById<FrameLayout>(R.id.rootContainer)
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = true
        insetsController.isAppearanceLightNavigationBars = true

        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        progressBar = findViewById(R.id.progressBar)
        offlineView = findViewById(R.id.offlineView)
        retryButton = findViewById(R.id.retryButton)

        swipeRefresh.isEnabled = false
        retryButton.setOnClickListener {
            offlineView.visibility = View.GONE
            webView.loadUrl(initialUrl)
        }

        configureWebView()
        webView.loadUrl(initialUrl)
        handleAuthCallbackIntent(intent)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthCallbackIntent(intent)
    }

    private fun handleAuthCallbackIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "khaddostock" && data.host == "auth-callback") {
            val state = data.getQueryParameter("state") ?: ""
            val accessToken = data.getQueryParameter("access_token") ?: ""
            val email = data.getQueryParameter("email") ?: ""
            val displayName = data.getQueryParameter("display_name") ?: ""
            val uid = data.getQueryParameter("uid") ?: ""
            val photoUrl = data.getQueryParameter("photo_url") ?: ""

            val payload = JSONObject().apply {
                put("state", state)
                if (accessToken.isNotBlank()) put("accessToken", accessToken)
                if (email.isNotBlank()) put("email", email)
                if (displayName.isNotBlank()) put("displayName", displayName)
                if (uid.isNotBlank()) put("uid", uid)
                if (photoUrl.isNotBlank()) put("photoUrl", photoUrl)
            }
            val payloadStr = payload.toString()
            pendingAuthCallbackJson = payloadStr

            if (isPageLoaded) {
                webView.post {
                    val js = "window.__onAndroidAuthCallback && window.__onAndroidAuthCallback(" +
                        payloadStr + ");"
                    webView.evaluateJavascript(js, null)
                    pendingAuthCallbackJson = null
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.addJavascriptInterface(AndroidBlobBridge(), "AndroidBlobBridge")
        webView.setDownloadListener { url, _, _, _, _ ->
            if (!url.isNullOrBlank() && (url.startsWith("http://") || url.startsWith("https://"))) {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "ডাউনলোড খোলা যায়নি: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val urlStr = request?.url?.toString() ?: return false
                if (
                    urlStr.contains("accounts.google.com") ||
                    urlStr.contains("/__/auth/") ||
                    urlStr.contains("oauth2")
                ) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(urlStr))
                        startActivity(intent)
                    } catch (_: Exception) {
                    }
                    return true
                }
                return false
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host == "appassets.androidplatform.net") {
                    return assetLoader.shouldInterceptRequest(url)
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                isPageLoaded = true
                offlineView.visibility = View.GONE
                val pendingAuth = pendingAuthCallbackJson
                if (pendingAuth != null) {
                    pendingAuthCallbackJson = null
                    view?.evaluateJavascript(
                        "window.__onAndroidAuthCallback && window.__onAndroidAuthCallback(" + pendingAuth + ");",
                        null
                    )
                }
                view?.evaluateJavascript(
                    """
                    (function() {
                        if (window.__androidDownloadHooked) return;
                        window.__androidDownloadHooked = true;
                        window.__androidBlobMap = window.__androidBlobMap || {};
                        var origCreate = URL.createObjectURL;
                        URL.createObjectURL = function(blob) {
                            var url = origCreate.call(URL, blob);
                            if (blob) {
                                window.__androidBlobMap[url] = blob;
                                var bType = (blob.type || '').toLowerCase();
                                if (bType.indexOf('csv') !== -1 || bType.indexOf('json') !== -1 || bType.indexOf('pdf') !== -1) {
                                    var reader = new FileReader();
                                    reader.onloadend = function() {
                                        var ext = bType.indexOf('pdf') !== -1 ? 'pdf' : (bType.indexOf('csv') !== -1 ? 'csv' : 'json');
                                        if (window.AndroidBlobBridge) {
                                            window.AndroidBlobBridge.saveBase64File(reader.result, 'khaddo-boraddo-' + Date.now() + '.' + ext, bType);
                                        }
                                    };
                                    reader.readAsDataURL(blob);
                                }
                            }
                            return url;
                        };
                        document.addEventListener('click', function(ev) {
                            var a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
                            if (!a) return;
                            var href = a.getAttribute('href') || '';
                            var fname = a.getAttribute('download') || 'khaddo-boraddo-file';
                            if (href.indexOf('data:') === 0 && window.AndroidBlobBridge) {
                                ev.preventDefault();
                                window.AndroidBlobBridge.saveBase64File(href, fname, '');
                            } else if (href.indexOf('blob:') === 0 && window.__androidBlobMap[href] && window.AndroidBlobBridge) {
                                ev.preventDefault();
                                var b = window.__androidBlobMap[href];
                                var r = new FileReader();
                                r.onloadend = function() {
                                    window.AndroidBlobBridge.saveBase64File(r.result, fname, b.type || '');
                                };
                                r.readAsDataURL(b);
                            }
                        }, true);
                    })();
                    """.trimIndent(),
                    null
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    offlineView.visibility = View.VISIBLE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                fileChooserLauncher.launch(Intent.createChooser(intent, "ব্যাকআপ JSON ফাইল বাছাই করুন"))
                return true
            }
        }
    }

    inner class AndroidBlobBridge {
        @JavascriptInterface
        fun saveBase64File(base64Data: String, fileName: String, mimeType: String) {
            runOnUiThread {
                try {
                    val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
                    val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                    val safeName = if (fileName.isBlank()) "khaddo-boraddo-export.pdf" else fileName
                    val resolvedMime = when {
                        mimeType.isNotBlank() -> mimeType
                        safeName.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                        safeName.endsWith(".json", ignoreCase = true) -> "application/json"
                        safeName.endsWith(".zip", ignoreCase = true) -> "application/zip"
                        safeName.endsWith(".txt", ignoreCase = true) -> "text/plain"
                        else -> "text/csv"
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply {
                            put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                            put(MediaStore.Downloads.MIME_TYPE, resolvedMime)
                            put(MediaStore.Downloads.IS_PENDING, 1)
                        }
                        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        if (uri != null) {
                            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                            values.clear()
                            values.put(MediaStore.Downloads.IS_PENDING, 0)
                            contentResolver.update(uri, values, null, null)
                        }
                    } else {
                        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                        if (!dir.exists()) dir.mkdirs()
                        val outFile = File(dir, safeName)
                        FileOutputStream(outFile).use { it.write(bytes) }
                    }
                    Toast.makeText(this@MainActivity, "ফাইল ডাউনলোড সম্পন্ন: $safeName", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "সেভ ব্যর্থ: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun openExternalBrowser(targetUrl: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl))
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "ব্রাউজার খোলা যায়নি: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun printCurrentPage() {
            runOnUiThread {
                try {
                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val adapter = webView.createPrintDocumentAdapter("Khaddo_Boraddo_Report")
                    printManager.print("খাদ্যশস্য_বরাদ্দ_রিপোর্ট", adapter, PrintAttributes.Builder().build())
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "প্রিন্ট শুরু করা যায়নি: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun httpRequest(requestId: String, method: String, urlStr: String, body: String) {
            Thread {
                val resJson = JSONObject()
                try {
                    var currentUrl = urlStr
                    var currentMethod = method.uppercase()
                    var currentBody = body
                    var code = 0
                    var responseText = ""

                    for (hop in 0..5) {
                        val conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                            instanceFollowRedirects = false
                            connectTimeout = 20000
                            readTimeout = 25000
                            requestMethod = currentMethod
                            setRequestProperty("Accept", "application/json, text/plain, */*")
                            if (currentMethod == "POST") {
                                doOutput = true
                                setRequestProperty("Content-Type", "text/plain;charset=utf-8")
                                outputStream.use { os ->
                                    os.write(currentBody.toByteArray(Charsets.UTF_8))
                                }
                            }
                        }
                        code = conn.responseCode
                        if (code in 301..308 && code != 304) {
                            val loc = conn.getHeaderField("Location")
                            conn.disconnect()
                            if (loc.isNullOrBlank()) break
                            currentUrl = URL(URL(currentUrl), loc).toString()
                            if (code == 301 || code == 302 || code == 303) {
                                currentMethod = "GET"
                                currentBody = ""
                            }
                            continue
                        }
                        val stream = if (code >= 400) conn.errorStream else conn.inputStream
                        responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                        conn.disconnect()
                        break
                    }
                    resJson.put("ok", code in 200..299)
                    resJson.put("status", code)
                    resJson.put("text", responseText)
                } catch (e: Exception) {
                    resJson.put("ok", false)
                    resJson.put("status", 0)
                    resJson.put("error", e.message ?: "Network error")
                }

                val script = "window.__androidHttpCallback && window.__androidHttpCallback(" +
                    JSONObject.quote(requestId) + ", " + resJson.toString() + ");"
                runOnUiThread {
                    webView.evaluateJavascript(script, null)
                }
            }.start()
        }
    }
}
