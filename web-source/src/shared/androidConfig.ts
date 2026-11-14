export interface AndroidAppConfig {
  appName: string;
  shortName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  targetUrl: string;
  primaryColor: string;
  secondaryColor: string;
  orientation: 'unspecified' | 'portrait' | 'landscape';
  enableCameraQr: boolean;
  enableFileUpload: boolean;
  enablePdfDownloads: boolean;
  enablePullToRefresh: boolean;
  enableDeepLinks: boolean;
  openExternalVerifyInBrowser: boolean;
  hideAppsScriptBanner: boolean;
  bundleOfflineAssets?: boolean;
}

export const DEFAULT_TARGET_URL = 'https://appassets.androidplatform.net/index.html';

export const DEFAULT_ANDROID_CONFIG: AndroidAppConfig = {
  appName: 'খাদ্যশস্য বরাদ্দ ও বিতরণ',
  shortName: 'খাদ্যবরাদ্দ',
  packageName: 'com.foodalloc.upazila',
  versionName: '1.0.0',
  versionCode: 1,
  targetUrl: DEFAULT_TARGET_URL,
  primaryColor: '#0d6e4e',
  secondaryColor: '#065f46',
  orientation: 'portrait',
  enableCameraQr: false,
  enableFileUpload: true,
  enablePdfDownloads: true,
  enablePullToRefresh: false,
  enableDeepLinks: false,
  openExternalVerifyInBrowser: true,
  hideAppsScriptBanner: false,
  bundleOfflineAssets: true,
};

export function validateAndroidConfig(config: AndroidAppConfig): string[] {
  const errors: string[] = [];
  if (!config.appName.trim()) {
    errors.push('App name cannot be empty.');
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(config.packageName)) {
    errors.push('Package name must be valid reverse-DNS format (e.g. com.foodalloc.upazila).');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(config.primaryColor)) {
    errors.push('Primary color must be a 6-digit hex color.');
  }
  if (!Number.isInteger(config.versionCode) || config.versionCode < 1) {
    errors.push('Version code must be a positive integer.');
  }
  return errors;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

function escapeKotlinString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function generateAndroidManifestXml(config: AndroidAppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.KhaddoStock"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:screenOrientation="${config.orientation}"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="khaddostock"
                    android:host="auth-callback" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}

export function generateAppBuildGradleKts(config: AndroidAppConfig): string {
  return `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "${config.packageName}"
    compileSdk = 35

    defaultConfig {
        applicationId = "${config.packageName}"
        minSdk = 24
        targetSdk = 35
        versionCode = ${config.versionCode}
        versionName = "${escapeKotlinString(config.versionName)}"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
`;
}

export function generateRootBuildGradleKts(): string {
  return `plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`;
}

export function generateSettingsGradleKts(config: AndroidAppConfig): string {
  const safeRootName = config.shortName.replace(/[^a-zA-Z0-9_-]/g, '') || 'KhaddoBoraddo';
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${safeRootName}"
include(":app")
`;
}

export function generateGradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`;
}

export function generateGradleWrapperProperties(): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

export function generateStringsXml(config: AndroidAppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(config.appName)}</string>
    <string name="offline_title">অ্যাপ লোড করা যায়নি</string>
    <string name="offline_message">পুনরায় লোড করতে নিচের বাটনে চাপ দিন।</string>
    <string name="retry_button">আবার চেষ্টা করুন</string>
</resources>
`;
}

export function generateColorsXml(config: AndroidAppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="brand_primary">${config.primaryColor}</color>
    <color name="brand_secondary">${config.secondaryColor}</color>
    <color name="ic_launcher_background">${config.primaryColor}</color>
    <color name="surface_bg">#F5F7F6</color>
    <color name="ink_primary">#0F172A</color>
</resources>
`;
}

export function generateThemesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.KhaddoStock" parent="Theme.Material3.Light.NoActionBar">
        <item name="colorPrimary">@color/brand_primary</item>
        <item name="colorSecondary">@color/brand_secondary</item>
        <item name="android:statusBarColor">@color/brand_primary</item>
        <item name="android:navigationBarColor">@color/surface_bg</item>
    </style>
</resources>
`;
}

export function generateFilePathsXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="exports" path="." />
    <external-files-path name="external_files" path="." />
</paths>
`;
}

export function generateActivityMainXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/rootContainer"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@color/surface_bg"
    android:fitsSystemWindows="true">

    <androidx.swiperefreshlayout.widget.SwipeRefreshLayout
        android:id="@+id/swipeRefresh"
        android:layout_width="match_parent"
        android:layout_height="match_parent">

        <WebView
            android:id="@+id/webView"
            android:layout_width="match_parent"
            android:layout_height="match_parent" />
    </androidx.swiperefreshlayout.widget.SwipeRefreshLayout>

    <ProgressBar
        android:id="@+id/progressBar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="3dp"
        android:layout_gravity="top"
        android:max="100"
        android:progressTint="@color/brand_primary"
        android:visibility="gone" />

    <LinearLayout
        android:id="@+id/offlineView"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@color/surface_bg"
        android:gravity="center"
        android:orientation="vertical"
        android:padding="28dp"
        android:visibility="gone">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="@string/offline_title"
            android:textColor="@color/ink_primary"
            android:textSize="20sp"
            android:textStyle="bold" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:gravity="center"
            android:text="@string/offline_message"
            android:textColor="#475569"
            android:textSize="14sp" />

        <com.google.android.material.button.MaterialButton
            android:id="@+id/retryButton"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="20dp"
            android:backgroundTint="@color/brand_primary"
            android:text="@string/retry_button" />
    </LinearLayout>
</FrameLayout>
`;
}

export function generateAdaptiveIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
}

export function generateAdaptiveForegroundXml(config: AndroidAppConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M34,30H74C77.3,30 80,32.7 80,36V76C80,79.3 77.3,82 74,82H34C30.7,82 28,79.3 28,76V36C28,32.7 30.7,30 34,30Z" />
    <path
        android:fillColor="${config.primaryColor}"
        android:pathData="M42,40H52V50H62V58H52V68H42V58H32V50H42V40Z" />
    <path
        android:fillColor="#B91C1C"
        android:pathData="M56,64H74V72H56V64Z" />
</vector>
`;
}

export function generateMainActivityKt(config: AndroidAppConfig): string {
  const startUrl = config.bundleOfflineAssets
    ? 'https://appassets.androidplatform.net/index.html'
    : escapeKotlinString(config.targetUrl || DEFAULT_TARGET_URL);

  return `package ${config.packageName}

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

    private val initialUrl = "${startUrl}"
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
                    Toast.makeText(this@MainActivity, "ডাউনলোড খোলা যায়নি: \${e.message}", Toast.LENGTH_LONG).show()
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
                    Toast.makeText(this@MainActivity, "ফাইল ডাউনলোড সম্পন্ন: \$safeName", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "সেভ ব্যর্থ: \${e.message}", Toast.LENGTH_LONG).show()
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
                    Toast.makeText(this@MainActivity, "ব্রাউজার খোলা যায়নি: \${e.message}", Toast.LENGTH_LONG).show()
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
                    Toast.makeText(this@MainActivity, "প্রিন্ট শুরু করা যায়নি: \${e.message}", Toast.LENGTH_LONG).show()
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
`;
}

export function generateGitHubActionsWorkflow(config: AndroidAppConfig): string {
  const safeArtifact = config.shortName.replace(/[^a-zA-Z0-9_-]/g, '') || 'KhaddoBoraddo';
  return `name: Build Android APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Extract Android project ZIP (if uploaded as ZIP)
        run: |
          ANDROID_ZIP=""
          LATEST_TS=-1
          while IFS= read -r z; do
            if unzip -l "$z" 2>/dev/null | grep -q "settings.gradle.kts"; then
              TS=$(git log -1 --format="%ct" -- "$z" 2>/dev/null || echo 0)
              TS=\${TS:-0}
              if [ "$TS" -gt "$LATEST_TS" ] 2>/dev/null; then
                LATEST_TS="$TS"
                ANDROID_ZIP="$z"
              elif [ -z "$ANDROID_ZIP" ]; then
                ANDROID_ZIP="$z"
              fi
            fi
          done < <(find . -maxdepth 3 -type f -name "*.zip" 2>/dev/null | sort -V -r)
          if [ -n "$ANDROID_ZIP" ]; then
            echo "Extracting project from $ANDROID_ZIP..."
            unzip -o "$ANDROID_ZIP" -d .extracted_android_tmp
            if [ -f ".extracted_android_tmp/settings.gradle.kts" ]; then
              cp -rf .extracted_android_tmp/. .
            else
              NESTED_DIR=$(dirname "$(find .extracted_android_tmp -maxdepth 4 -name "settings.gradle.kts" | head -n 1)")
              if [ -n "$NESTED_DIR" ] && [ -f "$NESTED_DIR/settings.gradle.kts" ]; then
                cp -rf "$NESTED_DIR"/. .
              fi
            fi
            rm -rf .extracted_android_tmp
          elif [ ! -f "settings.gradle.kts" ] && [ -f "android/settings.gradle.kts" ]; then
            echo "Using nested android/ directory..."
            cp -rf android/. .
          fi
          if [ ! -f "settings.gradle.kts" ] || [ ! -f "app/build.gradle.kts" ]; then
            echo "::error::Android project files not found!"
            ls -la
            exit 1
          fi

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Build latest web assets from source
        run: |
          WEB_DIR=""
          if [ -f "package.json" ]; then
            WEB_DIR="."
          elif [ -f "web-source/package.json" ]; then
            WEB_DIR="web-source"
          fi
          if [ -n "$WEB_DIR" ]; then
            echo "Building latest web assets from $WEB_DIR..."
            (cd "$WEB_DIR" && npm install && npm run build)
            if [ -f "app/src/main/assets/web-seed.json" ]; then
              cp "app/src/main/assets/web-seed.json" /tmp/web-seed.json
            fi
            rm -rf app/src/main/assets
            mkdir -p app/src/main/assets
            cp -rf "$WEB_DIR/dist/." app/src/main/assets/
            if [ -f /tmp/web-seed.json ]; then
              cp /tmp/web-seed.json app/src/main/assets/web-seed.json
            fi
          elif [ ! -f "app/src/main/assets/index.html" ]; then
            echo "::error::Neither web source (package.json) nor pre-built app/src/main/assets/index.html found!"
            exit 1
          fi

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Gradle 8.9
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'

      - name: Accept Android SDK Licenses
        run: yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true

      - name: Build Debug APK
        run: gradle assembleDebug --no-daemon --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeArtifact}-debug-apk
          path: app/build/outputs/apk/debug/*.apk
`;
}

export function generateProjectReadme(config: AndroidAppConfig): string {
  return `# ${config.appName} — Android APK Project

উপজেলা খাদ্য নিয়ন্ত্রকের কার্যালয়ের খাদ্যশস্য বরাদ্দ, উপবরাদ্দ, ডিও বই, ডিও ইস্যু, চালান যাচাই এবং নিকোশ ফন্টে ১৫টি রেজিস্টার ও মাসিক রিপোর্ট ব্যবস্থাপনা অ্যাপ।

- **Package ID**: \`${config.packageName}\`
- **Version**: \`${config.versionName}\` (${config.versionCode})

## GitHub-এ ফাইল আপলোড, এডিট ও APK বানানোর ধাপসমূহ
1. ডাউনলোড করা \`.zip\` ফাইলটি সরাসরি GitHub-এ আপলোড না করে আগে আপনার কম্পিউটার বা ফোনে **Extract / Unzip** করুন।
2. GitHub রিপোজিটরিতে পুরনো কোনো \`.zip\` ফাইল থাকলে সেটি ডিলিট করে Unzip করা ফোল্ডারের **ভিতরের সব ফাইল ও ফোল্ডার** (যেমন \`src\`, \`public\`, \`android\`, \`.github\`, \`package.json\`) আপলোড করুন।
3. এতে GitHub-এর ভিতরেই প্রতিটি কোড ফাইল সরাসরি এডিট করতে পারবেন এবং কোনো কোড পরিবর্তন করলে GitHub Actions স্বয়ংক্রিয়ভাবে নতুন ওয়েব ও APK বিল্ড তৈরি করবে।
4. রিপোজিটরির **Actions** ট্যাবে গিয়ে **Build Android APK** বিল্ড শেষ হলে **Artifacts** থেকে \`app-debug.apk\` ডাউনলোড করে ইনস্টল করুন।
`;
}
