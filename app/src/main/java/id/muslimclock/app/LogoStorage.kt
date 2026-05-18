package id.muslimclock.app

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID

/**
 * Stores a single user-uploaded masjid logo in app-private storage at
 * `filesDir/logo/`. Files copied here are served back to the WebView
 * through [androidx.webkit.WebViewAssetLoader] under the virtual host
 * `https://appassets.androidplatform.net/logo/<name>`.
 *
 * Only one logo is kept at a time — importing a new one wipes the old
 * file, so we never accumulate orphans the user can't see.
 *
 * Transparent PNG / WEBP / SVG go through unchanged: we copy the bytes
 * verbatim so whatever the user uploaded is exactly what the WebView
 * renders, including the alpha channel.
 */
object LogoStorage {

    /** Path served by WebViewAssetLoader. Keep in sync with MainActivity. */
    const val URL_PREFIX = "https://appassets.androidplatform.net/logo/"

    /**
     * Logos are usually small. 4 MB is plenty even for a chunky PNG —
     * keeps imports snappy and avoids accidental "they uploaded a
     * 50 MB photo" footguns.
     */
    private const val MAX_BYTES = 4L * 1024 * 1024

    /**
     * Image MIME types we accept. SVG is allowed because plenty of
     * masjid logos are vector — the WebView renders them as <img src>
     * just fine.
     */
    private val ALLOWED_MIME = setOf(
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/svg+xml",
    )

    fun dir(ctx: Context): File =
        File(ctx.filesDir, "logo").apply { if (!exists()) mkdirs() }

    /**
     * Copy the picked content URI into private storage. Returns the
     * public `appassets` URL on success, or null if the file is too big
     * / wrong type / unreadable. Wipes any previous logo on success so
     * only one file lives in [dir] at a time.
     */
    fun importLogo(ctx: Context, uri: Uri): String? {
        val cr = ctx.contentResolver
        val mime = resolveMime(cr, uri) ?: return null
        if (mime !in ALLOWED_MIME) return null

        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            ?: when (mime) {
                "image/svg+xml" -> "svg"
                else -> "img"
            }
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

        // Only one logo at a time — drop every other file in the dir
        // now that the new one is safely on disk.
        dir(ctx).listFiles()?.forEach { f ->
            if (f.name != name) f.delete()
        }

        return URL_PREFIX + name
    }

    /** Wipe the stored logo, if any. Returns true if a file was removed. */
    fun clear(ctx: Context): Boolean {
        val files = dir(ctx).listFiles() ?: return false
        var removed = false
        for (f in files) if (f.delete()) removed = true
        return removed
    }

    /** True if the given URL is one we minted (i.e. backed by a local file). */
    fun isLocalLogoUrl(url: String?): Boolean =
        !url.isNullOrEmpty() && url.startsWith(URL_PREFIX)

    private fun resolveMime(cr: ContentResolver, uri: Uri): String? {
        cr.getType(uri)?.let { return it }
        val ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString())?.lowercase()
        return ext?.let { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it) }
    }
}
