package id.muslimclock.app

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID

/**
 * Stores a single user-uploaded adzan alarm audio file in app-private
 * storage at `filesDir/audio/`. Files copied here are served back to the
 * WebView through [androidx.webkit.WebViewAssetLoader] under the virtual
 * host `https://appassets.androidplatform.net/audio/<name>`.
 *
 * Mirrors the LogoStorage / SlideStorage shape: only one active file at
 * a time, importing a new one wipes the previous so we never accumulate
 * orphans the user can't see.
 *
 * We deliberately keep the size cap generous — full adzan recordings
 * are commonly 4–8 MB, and looping a 30-min lecture would still fit.
 */
object AudioStorage {

    /** Path served by WebViewAssetLoader. Keep in sync with MainActivity. */
    const val URL_PREFIX = "https://appassets.androidplatform.net/audio/"

    /**
     * 32 MB ceiling. A typical full adzan in 192 kbps MP3 is ~4 MB; this
     * leaves comfortable room for high-quality recordings without letting
     * users accidentally upload a multi-hour recording that fills storage.
     */
    private const val MAX_BYTES = 32L * 1024 * 1024

    /**
     * Audio MIME types we accept. Stick to formats Android's stock
     * MediaPlayer / WebView <audio> reliably play across versions —
     * mp3, ogg/vorbis, aac/m4a, wav, and webm/opus.
     */
    private val ALLOWED_MIME = setOf(
        "audio/mpeg",       // .mp3
        "audio/mp3",        // alt label some pickers send
        "audio/aac",        // .aac
        "audio/mp4",        // .m4a (AAC in MP4 container)
        "audio/x-m4a",
        "audio/ogg",        // .ogg / .oga
        "audio/wav",        // .wav
        "audio/x-wav",
        "audio/wave",
        "audio/webm",       // .webm (Opus)
        "audio/flac",       // .flac (newer WebView only, but harmless)
    )

    fun dir(ctx: Context): File =
        File(ctx.filesDir, "audio").apply { if (!exists()) mkdirs() }

    /**
     * Copy the picked content URI into private storage. Returns the
     * public `appassets` URL on success, or null if the file is too big
     * / wrong type / unreadable. Wipes any previous audio on success so
     * only one file lives in [dir] at a time.
     */
    fun importAudio(ctx: Context, uri: Uri): String? {
        val cr = ctx.contentResolver
        val mime = resolveMime(cr, uri) ?: return null
        if (mime !in ALLOWED_MIME) return null

        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            ?: when (mime) {
                "audio/mpeg", "audio/mp3" -> "mp3"
                "audio/mp4", "audio/x-m4a" -> "m4a"
                "audio/ogg" -> "ogg"
                "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
                "audio/webm" -> "webm"
                "audio/flac" -> "flac"
                "audio/aac"  -> "aac"
                else -> "audio"
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

        // Only one file at a time — drop everything else now that the
        // new file is safely on disk.
        dir(ctx).listFiles()?.forEach { f ->
            if (f.name != name) f.delete()
        }

        return URL_PREFIX + name
    }

    /** Wipe the stored audio, if any. Returns true if a file was removed. */
    fun clear(ctx: Context): Boolean {
        val files = dir(ctx).listFiles() ?: return false
        var removed = false
        for (f in files) if (f.delete()) removed = true
        return removed
    }

    /** True if the given URL is one we minted (i.e. backed by a local file). */
    fun isLocalAudioUrl(url: String?): Boolean =
        !url.isNullOrEmpty() && url.startsWith(URL_PREFIX)

    private fun resolveMime(cr: ContentResolver, uri: Uri): String? {
        cr.getType(uri)?.let { return it }
        val ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString())?.lowercase()
        return ext?.let { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it) }
    }
}
