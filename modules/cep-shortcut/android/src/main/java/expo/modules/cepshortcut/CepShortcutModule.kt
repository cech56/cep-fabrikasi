package expo.modules.cepshortcut

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Bir mini uygulamayı telefonun ana ekranına kısayol olarak sabitler.
class CepShortcutModule : Module() {
  private val context get() = appContext.reactContext ?: throw IllegalStateException("Bağlam yok")

  override fun definition() = ModuleDefinition {
    Name("CepShortcut")

    Function("isSupported") {
      ShortcutManagerCompat.isRequestPinShortcutSupported(context)
    }

    // "pinned": ana ekrana ekleme penceresi açıldı
    // "dynamic": başlatıcı sabitlemeyi desteklemiyor; uygulama simgesine basılı tutunca çıkan menüye eklendi
    Function("pin") { id: String, label: String, emoji: String ->
      val ctx = context
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("cepfabrikasi://app/$id")).setPackage(ctx.packageName)
      val info = ShortcutInfoCompat.Builder(ctx, "app-$id")
        .setShortLabel(label.take(24).ifBlank { "Uygulama" })
        .setIcon(IconCompat.createWithAdaptiveBitmap(emojiIcon(emoji)))
        .setIntent(intent)
        .build()
      if (ShortcutManagerCompat.isRequestPinShortcutSupported(ctx) && ShortcutManagerCompat.requestPinShortcut(ctx, info, null)) {
        "pinned"
      } else {
        ShortcutManagerCompat.pushDynamicShortcut(ctx, info)
        "dynamic"
      }
    }

    // ---- El feneri (izin gerektirmez) ----
    Function("torch") { on: Boolean ->
      val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
        ?: throw IllegalStateException("Bu telefonda fener yok")
      cm.setTorchMode(id, on)
      true
    }

    // ---- Ana ekran widget'ı ----
    // Widget'ta gösterilecek uygulamayı seçer
    Function("setWidget") { appId: String, title: String, body: String ->
      widgetPrefs().edit().putString("appId", appId).putString("title", title).putString("body", body).apply()
      CepWidgetProvider.refresh(context)
      CepWidgetProvider.count(context)
    }
    // Seçili uygulama özetini güncellediyse widget'ı yeniler
    Function("updateWidget") { appId: String, body: String ->
      val prefs = widgetPrefs()
      if (prefs.getString("appId", null) != appId) return@Function false
      prefs.edit().putString("body", body).apply()
      CepWidgetProvider.refresh(context)
      true
    }
    Function("widgetAppId") { widgetPrefs().getString("appId", null) }
    Function("widgetCount") { CepWidgetProvider.count(context) }
    // Kullanıcıya "widget ekle" penceresini açar (Android 8+ ve destekleyen başlatıcılarda)
    Function("requestPinWidget") {
      val ctx = context
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = ctx.getSystemService(AppWidgetManager::class.java) ?: return@Function false
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      manager.requestPinAppWidget(ComponentName(ctx, CepWidgetProvider::class.java), null, null)
    }
  }

  private fun widgetPrefs() = context.getSharedPreferences(CepWidgetProvider.PREFS, Context.MODE_PRIVATE)

  // Turuncu zemin üzerine emoji çizilmiş uyarlanabilir ikon (108dp eşdeğeri).
  private fun emojiIcon(emoji: String): Bitmap {
    val size = 432
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(Color.parseColor("#F97316"))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size * 0.36f
      textAlign = Paint.Align.CENTER
    }
    val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(emoji.ifBlank { "✨" }, size / 2f, y, paint)
    return bmp
  }
}
