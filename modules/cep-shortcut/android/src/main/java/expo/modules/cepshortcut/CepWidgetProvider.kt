package expo.modules.cepshortcut

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

// Ana ekran widget'ı: seçilen mini uygulamanın adını ve kısa özetini gösterir, dokununca o uygulamayı açar.
class CepWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context, manager, ids)
  }

  companion object {
    const val PREFS = "cep_widget"

    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, CepWidgetProvider::class.java))
      render(context, manager, ids)
    }

    fun count(context: Context): Int {
      val manager = AppWidgetManager.getInstance(context)
      return manager.getAppWidgetIds(ComponentName(context, CepWidgetProvider::class.java)).size
    }

    private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val appId = prefs.getString("appId", null)
      val views = RemoteViews(context.packageName, R.layout.cep_widget)
      if (appId != null) {
        views.setTextViewText(R.id.cep_widget_title, prefs.getString("title", "") ?: "")
        views.setTextViewText(R.id.cep_widget_body, prefs.getString("body", "") ?: "")
      }
      val intent = if (appId != null) {
        Intent(Intent.ACTION_VIEW, Uri.parse("cepfabrikasi://app/$appId")).setPackage(context.packageName)
      } else {
        context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      views.setOnClickPendingIntent(R.id.cep_widget_root, pending)
      for (id in ids) manager.updateAppWidget(id, views)
    }
  }
}
