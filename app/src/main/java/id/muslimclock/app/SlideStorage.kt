package id.muslimclock.app

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID

/**
 * Lives entirely in app-private storage at `filesDir/slides/`. Files copied
 * here are served back to the WebView through [WebViewAssetLoader] under the
 * virtual host `https://appassets.androidplatform.net/slides/<name>`.
 *
 * We never expose `file://` paths to the WebView — that would require
 * `setAllowFileAccess(true)` and is widely flagged by review tools.
 */
object SlideStorage {

    /** Path served by WebViewAssetLoader. Keep in sync with MainActivity. */
    const val URL_PREFIX = "https://appassets.androidplatform.net/slides/"

    /** Anything bigger than this is silently rejected to keep the APK
     *  responsive on slow TV boxes; users see a toast in [importImage]. */
    private const val MAX_BYTES = 8L * 1024 * 1024  // 8 MB

    private val ALLOWED_MIME = setOf(
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"
    )

    fun dir(ctx: Context): File =
        File(ctx.filesDir, "slides").apply { if (!exists()) mkdirs() }

    /**
     * Copy the picked content URI into private storage. Returns the public
     * `appassets` URL on success, or null if the file is too big / wrong
     * type / unreadable.
     */
    fun importImage(ctx: Context, uri: Uri): String? {
        val cr = ctx.contentResolver
        val mime = resolveMime(cr, uri) ?: return null
        if (mime !in ALLOWED_MIME) return null

        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "img"
        val name = "${UUID.randomUUID()}.$ext"
        val target = File(dir(ctx), name)

        cr.openInputStream(uri).use { input ->
            if (input == null) return null
            target.outputStream().use { out ->
                var copied = 0L
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val r = input.read(buf)
                    if (r < 0) break
                    copied += r
                    if (copied > MAX_BYTES) {
                        out.close()
                        target.delete()
                        return null
                    }
                    out.write(buf, 0, r)
                }
            }
        }
        return URL_PREFIX + name
    }

    /** Wipe every stored slide. Returns the number of files removed. */
    fun clearAll(ctx: Context): Int {
        val d = dir(ctx)
        var n = 0
        d.listFiles()?.forEach { if (it.delete()) n++ }
        return n
    }

    private fun resolveMime(cr: ContentResolver, uri: Uri): String? {
        cr.getType(uri)?.let { return it }
        val ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString())?.lowercase()
        return ext?.let { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it) }
    }
}
