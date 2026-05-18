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
 * Both still images and short video clips are accepted — the web side
 * autoplays videos muted on a loop. Video files have a larger size budget
 * because even a 5-second 720p clip easily clears the image cap.
 *
 * We never expose `file://` paths to the WebView — that would require
 * `setAllowFileAccess(true)` and is widely flagged by review tools.
 */
object SlideStorage {

    /** Path served by WebViewAssetLoader. Keep in sync with MainActivity. */
    const val URL_PREFIX = "https://appassets.androidplatform.net/slides/"

    /** Cap for still-image imports — keeps the APK responsive on TV boxes. */
    private const val MAX_IMAGE_BYTES = 8L  * 1024 * 1024  // 8 MB

    /** Larger cap for video imports — masjid promo clips in HD/4K can be big. */
    private const val MAX_VIDEO_BYTES = 2049L * 1024 * 1024  // 2048 MB

    private val ALLOWED_IMAGE_MIME = setOf(
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"
    )

    /**
     * Conservative video formats — anything Android WebView's stock video
     * decoder reliably plays back. AV1 / HEVC etc. depend on device codec
     * support so we keep them out by default.
     */
    private val ALLOWED_VIDEO_MIME = setOf(
        "video/mp4", "video/webm", "video/3gpp", "video/x-matroska", "video/quicktime"
    )

    fun dir(ctx: Context): File =
        File(ctx.filesDir, "slides").apply { if (!exists()) mkdirs() }

    /**
     * Copy the picked content URI into private storage. Returns the public
     * `appassets` URL on success, or null if the file is too big / wrong
     * type / unreadable. Accepts both images and a small set of video
     * MIME types — see [ALLOWED_IMAGE_MIME] / [ALLOWED_VIDEO_MIME].
     */
    fun importImage(ctx: Context, uri: Uri): String? {
        val cr = ctx.contentResolver
        val mime = resolveMime(cr, uri) ?: return null

        val isVideo = mime in ALLOWED_VIDEO_MIME
        val isImage = mime in ALLOWED_IMAGE_MIME
        if (!isVideo && !isImage) return null
        val maxBytes = if (isVideo) MAX_VIDEO_BYTES else MAX_IMAGE_BYTES

        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            ?: if (isVideo) "mp4" else "img"
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
                    if (copied > maxBytes) {
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
