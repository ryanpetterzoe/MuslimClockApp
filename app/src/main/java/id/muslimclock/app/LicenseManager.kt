package id.muslimclock.app

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings.Secure
import android.util.Log
import com.google.firebase.database.FirebaseDatabase

/**
 * Manages license validation against Firebase Realtime Database.
 *
 * Database structure expected at `/licenses/{CODE}`:
 * ```
 * {
 *   "used": false,          // becomes true after activation
 *   "device_id": "",        // filled with ANDROID_ID on activation
 *   "activated_at": ""      // ISO timestamp on activation
 * }
 * ```
 *
 * Flow:
 * 1. User enters a code in Settings.
 * 2. [activate] reads `/licenses/{code}` from Firebase.
 *    - Not found → callback(ERROR_INVALID)
 *    - used == true AND device_id != this device → callback(ERROR_USED)
 *    - used == true AND device_id == this device → already activated, callback(SUCCESS)
 *    - used == false → write used=true, device_id, activated_at → callback(SUCCESS)
 * 3. On success, caller persists is_pro=true + license_key locally.
 *
 * [revalidate] is called on every app start:
 * - If local says is_pro but Firebase says device_id != ours → revoke locally.
 * - If Firebase unreachable → keep current state (grace period).
 */
object LicenseManager {

    private const val TAG = "MCLicense"
    private const val DB_PATH = "licenses"

    enum class Result {
        SUCCESS,
        ERROR_INVALID,
        ERROR_USED,
        ERROR_NETWORK
    }

    /**
     * Unique device identifier. Uses ANDROID_ID which is per-app-signing-key
     * on Android 8+ and per-device on older versions. Good enough for our
     * 1-license-1-device model without requiring extra permissions.
     */
    @SuppressLint("HardwareIds")
    fun getDeviceId(ctx: Context): String {
        return Secure.getString(ctx.contentResolver, Secure.ANDROID_ID) ?: "unknown"
    }

    /**
     * Attempt to activate a license code. Calls back on the main thread.
     */
    fun activate(ctx: Context, code: String, callback: (Result) -> Unit) {
        val trimmed = code.trim().uppercase()
        if (trimmed.isEmpty()) {
            callback(Result.ERROR_INVALID)
            return
        }

        val deviceId = getDeviceId(ctx)
        val ref = FirebaseDatabase.getInstance().getReference(DB_PATH).child(trimmed)

        ref.get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) {
                Log.w(TAG, "Code not found: $trimmed")
                callback(Result.ERROR_INVALID)
                return@addOnSuccessListener
            }

            val used = snapshot.child("used").getValue(Boolean::class.java) ?: false
            val storedDeviceId = snapshot.child("device_id").getValue(String::class.java) ?: ""

            if (used) {
                if (storedDeviceId == deviceId) {
                    // Already activated on this device — just confirm
                    Log.i(TAG, "Code already activated on this device")
                    callback(Result.SUCCESS)
                } else {
                    Log.w(TAG, "Code already used on another device")
                    callback(Result.ERROR_USED)
                }
                return@addOnSuccessListener
            }

            // Activate: mark as used with this device's ID
            val updates = mapOf(
                "used" to true,
                "device_id" to deviceId,
                "activated_at" to java.text.SimpleDateFormat(
                    "yyyy-MM-dd'T'HH:mm:ss'Z'",
                    java.util.Locale.US
                ).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }.format(java.util.Date())
            )

            ref.updateChildren(updates).addOnSuccessListener {
                Log.i(TAG, "License activated: $trimmed on device $deviceId")
                callback(Result.SUCCESS)
            }.addOnFailureListener { e ->
                Log.e(TAG, "Failed to write activation", e)
                callback(Result.ERROR_NETWORK)
            }

        }.addOnFailureListener { e ->
            Log.e(TAG, "Failed to read license from Firebase", e)
            callback(Result.ERROR_NETWORK)
        }
    }

    /**
     * Re-validate an already-activated license. Called on app start.
     *
     * If the license record in Firebase shows a different device_id,
     * the local pro status is revoked. If Firebase is unreachable,
     * we keep the current state (offline grace).
     *
     * @param callback true = still valid, false = revoked
     */
    fun revalidate(ctx: Context, licenseKey: String, callback: (Boolean) -> Unit) {
        if (licenseKey.isBlank()) {
            callback(false)
            return
        }

        val deviceId = getDeviceId(ctx)
        val ref = FirebaseDatabase.getInstance().getReference(DB_PATH).child(licenseKey)

        ref.get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) {
                // License deleted from DB → revoke
                Log.w(TAG, "License record gone, revoking")
                callback(false)
                return@addOnSuccessListener
            }

            val storedDeviceId = snapshot.child("device_id").getValue(String::class.java) ?: ""
            if (storedDeviceId != deviceId) {
                // Someone else claimed it (admin override?) → revoke
                Log.w(TAG, "Device mismatch: stored=$storedDeviceId, ours=$deviceId")
                callback(false)
            } else {
                callback(true)
            }
        }.addOnFailureListener {
            // Network error → grace period, keep current state
            Log.w(TAG, "Revalidation failed (network), keeping current state")
            callback(true)
        }
    }
}
