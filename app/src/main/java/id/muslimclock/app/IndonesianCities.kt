package id.muslimclock.app

/**
 * Static lookup table of Indonesian cities most useful for prayer-time
 * apps. Curated set: all provincial capitals plus the highest-population
 * regency/city centres (kota & kabupaten ibukota). Coordinates point at
 * the city centre / alun-alun / main mosque area where appropriate, and
 * are good to within a few hundred metres — well within Aladhan's
 * margin of error for daily prayer times.
 *
 * Used by [LocationSearchPreference] so the user can pick "Surabaya"
 * instead of typing -7.2575 / 112.7521.
 *
 * Timezone is the canonical IANA zone for the city; the Aladhan API
 * accepts those directly, so we forward it as the `timezone` setting.
 */
data class IndoCity(
    val name: String,
    val province: String,
    val lat: Double,
    val lng: Double,
    val timezone: String   // Asia/Jakarta | Asia/Makassar | Asia/Jayapura
)

object IndonesianCities {

    /**
     * Cities are roughly grouped by region for readable diffs. Order
     * within a province is alphabetical. All entries are normalised
     * so [search] can match by either city or province name.
     */
    val ALL: List<IndoCity> = listOf(
        // ---- DKI Jakarta ----
        IndoCity("Jakarta", "DKI Jakarta", -6.2088, 106.8456, "Asia/Jakarta"),
        IndoCity("Jakarta Pusat", "DKI Jakarta", -6.1865, 106.8343, "Asia/Jakarta"),
        IndoCity("Jakarta Utara", "DKI Jakarta", -6.1383, 106.8632, "Asia/Jakarta"),
        IndoCity("Jakarta Barat", "DKI Jakarta", -6.1683, 106.7588, "Asia/Jakarta"),
        IndoCity("Jakarta Selatan", "DKI Jakarta", -6.2615, 106.8106, "Asia/Jakarta"),
        IndoCity("Jakarta Timur", "DKI Jakarta", -6.2250, 106.9004, "Asia/Jakarta"),

        // ---- Jawa Barat ----
        IndoCity("Bandung", "Jawa Barat", -6.9175, 107.6191, "Asia/Jakarta"),
        IndoCity("Bekasi", "Jawa Barat", -6.2383, 106.9756, "Asia/Jakarta"),
        IndoCity("Bogor", "Jawa Barat", -6.5950, 106.8167, "Asia/Jakarta"),
        IndoCity("Cimahi", "Jawa Barat", -6.8722, 107.5425, "Asia/Jakarta"),
        IndoCity("Cirebon", "Jawa Barat", -6.7320, 108.5523, "Asia/Jakarta"),
        IndoCity("Depok", "Jawa Barat", -6.4025, 106.7942, "Asia/Jakarta"),
        IndoCity("Sukabumi", "Jawa Barat", -6.9277, 106.9300, "Asia/Jakarta"),
        IndoCity("Tasikmalaya", "Jawa Barat", -7.3274, 108.2207, "Asia/Jakarta"),
        IndoCity("Banjar", "Jawa Barat", -7.3697, 108.5340, "Asia/Jakarta"),
        IndoCity("Garut", "Jawa Barat", -7.2270, 107.9087, "Asia/Jakarta"),
        IndoCity("Karawang", "Jawa Barat", -6.3015, 107.3025, "Asia/Jakarta"),
        IndoCity("Subang", "Jawa Barat", -6.5712, 107.7607, "Asia/Jakarta"),
        IndoCity("Indramayu", "Jawa Barat", -6.3271, 108.3247, "Asia/Jakarta"),

        // ---- Banten ----
        IndoCity("Serang", "Banten", -6.1102, 106.1640, "Asia/Jakarta"),
        IndoCity("Tangerang", "Banten", -6.1783, 106.6319, "Asia/Jakarta"),
        IndoCity("Tangerang Selatan", "Banten", -6.2891, 106.7180, "Asia/Jakarta"),
        IndoCity("Cilegon", "Banten", -6.0024, 106.0114, "Asia/Jakarta"),
        IndoCity("Pandeglang", "Banten", -6.3088, 106.1075, "Asia/Jakarta"),

        // ---- Jawa Tengah ----
        IndoCity("Semarang", "Jawa Tengah", -6.9667, 110.4167, "Asia/Jakarta"),
        IndoCity("Solo (Surakarta)", "Jawa Tengah", -7.5755, 110.8243, "Asia/Jakarta"),
        IndoCity("Salatiga", "Jawa Tengah", -7.3306, 110.5083, "Asia/Jakarta"),
        IndoCity("Magelang", "Jawa Tengah", -7.4797, 110.2178, "Asia/Jakarta"),
        IndoCity("Pekalongan", "Jawa Tengah", -6.8898, 109.6753, "Asia/Jakarta"),
        IndoCity("Tegal", "Jawa Tengah", -6.8694, 109.1402, "Asia/Jakarta"),
        IndoCity("Purwokerto", "Jawa Tengah", -7.4288, 109.2335, "Asia/Jakarta"),
        IndoCity("Cilacap", "Jawa Tengah", -7.7268, 109.0090, "Asia/Jakarta"),
        IndoCity("Kudus", "Jawa Tengah", -6.8050, 110.8413, "Asia/Jakarta"),
        IndoCity("Kebumen", "Jawa Tengah", -7.6675, 109.6533, "Asia/Jakarta"),

        // ---- DI Yogyakarta ----
        IndoCity("Yogyakarta", "DI Yogyakarta", -7.7956, 110.3695, "Asia/Jakarta"),
        IndoCity("Sleman", "DI Yogyakarta", -7.7188, 110.3548, "Asia/Jakarta"),
        IndoCity("Bantul", "DI Yogyakarta", -7.8754, 110.3263, "Asia/Jakarta"),

        // ---- Jawa Timur ----
        IndoCity("Surabaya", "Jawa Timur", -7.2575, 112.7521, "Asia/Jakarta"),
        IndoCity("Malang", "Jawa Timur", -7.9819, 112.6265, "Asia/Jakarta"),
        IndoCity("Batu", "Jawa Timur", -7.8717, 112.5239, "Asia/Jakarta"),
        IndoCity("Kediri", "Jawa Timur", -7.8166, 112.0114, "Asia/Jakarta"),
        IndoCity("Madiun", "Jawa Timur", -7.6298, 111.5300, "Asia/Jakarta"),
        IndoCity("Mojokerto", "Jawa Timur", -7.4664, 112.4338, "Asia/Jakarta"),
        IndoCity("Pasuruan", "Jawa Timur", -7.6453, 112.9075, "Asia/Jakarta"),
        IndoCity("Probolinggo", "Jawa Timur", -7.7543, 113.2159, "Asia/Jakarta"),
        IndoCity("Blitar", "Jawa Timur", -8.0955, 112.1609, "Asia/Jakarta"),
        IndoCity("Banyuwangi", "Jawa Timur", -8.2191, 114.3691, "Asia/Jakarta"),
        IndoCity("Jember", "Jawa Timur", -8.1729, 113.6996, "Asia/Jakarta"),
        IndoCity("Sidoarjo", "Jawa Timur", -7.4478, 112.7183, "Asia/Jakarta"),
        IndoCity("Gresik", "Jawa Timur", -7.1625, 112.6519, "Asia/Jakarta"),

        // ---- Aceh ----
        IndoCity("Banda Aceh", "Aceh", 5.5483, 95.3238, "Asia/Jakarta"),
        IndoCity("Lhokseumawe", "Aceh", 5.1801, 97.1507, "Asia/Jakarta"),
        IndoCity("Sabang", "Aceh", 5.8941, 95.3236, "Asia/Jakarta"),
        IndoCity("Langsa", "Aceh", 4.4683, 97.9683, "Asia/Jakarta"),

        // ---- Sumatera Utara ----
        IndoCity("Medan", "Sumatera Utara", 3.5952, 98.6722, "Asia/Jakarta"),
        IndoCity("Binjai", "Sumatera Utara", 3.6001, 98.4854, "Asia/Jakarta"),
        IndoCity("Tebing Tinggi", "Sumatera Utara", 3.3286, 99.1625, "Asia/Jakarta"),
        IndoCity("Pematangsiantar", "Sumatera Utara", 2.9595, 99.0687, "Asia/Jakarta"),
        IndoCity("Sibolga", "Sumatera Utara", 1.7427, 98.7792, "Asia/Jakarta"),

        // ---- Sumatera Barat ----
        IndoCity("Padang", "Sumatera Barat", -0.9492, 100.3543, "Asia/Jakarta"),
        IndoCity("Bukittinggi", "Sumatera Barat", -0.3050, 100.3692, "Asia/Jakarta"),
        IndoCity("Padangpanjang", "Sumatera Barat", -0.4647, 100.4067, "Asia/Jakarta"),
        IndoCity("Payakumbuh", "Sumatera Barat", -0.2243, 100.6303, "Asia/Jakarta"),
        IndoCity("Solok", "Sumatera Barat", -0.7958, 100.6552, "Asia/Jakarta"),

        // ---- Riau / Kepri / Jambi / Bengkulu / Sumsel / Babel / Lampung ----
        IndoCity("Pekanbaru", "Riau", 0.5071, 101.4478, "Asia/Jakarta"),
        IndoCity("Dumai", "Riau", 1.6661, 101.4501, "Asia/Jakarta"),
        IndoCity("Tanjung Pinang", "Kepulauan Riau", 0.9180, 104.4585, "Asia/Jakarta"),
        IndoCity("Batam", "Kepulauan Riau", 1.0456, 104.0305, "Asia/Jakarta"),
        IndoCity("Jambi", "Jambi", -1.6101, 103.6131, "Asia/Jakarta"),
        IndoCity("Sungai Penuh", "Jambi", -2.0590, 101.3902, "Asia/Jakarta"),
        IndoCity("Bengkulu", "Bengkulu", -3.7928, 102.2608, "Asia/Jakarta"),
        IndoCity("Palembang", "Sumatera Selatan", -2.9909, 104.7566, "Asia/Jakarta"),
        IndoCity("Lubuklinggau", "Sumatera Selatan", -3.2981, 102.8617, "Asia/Jakarta"),
        IndoCity("Prabumulih", "Sumatera Selatan", -3.4326, 104.2358, "Asia/Jakarta"),
        IndoCity("Pangkalpinang", "Bangka Belitung", -2.1316, 106.1169, "Asia/Jakarta"),
        IndoCity("Bandar Lampung", "Lampung", -5.4292, 105.2610, "Asia/Jakarta"),
        IndoCity("Metro", "Lampung", -5.1131, 105.3066, "Asia/Jakarta"),

        // ---- Kalimantan ----
        IndoCity("Pontianak", "Kalimantan Barat", -0.0263, 109.3425, "Asia/Jakarta"),
        IndoCity("Singkawang", "Kalimantan Barat", 0.9077, 108.9851, "Asia/Jakarta"),
        IndoCity("Palangka Raya", "Kalimantan Tengah", -2.2094, 113.9165, "Asia/Jakarta"),
        IndoCity("Banjarmasin", "Kalimantan Selatan", -3.3186, 114.5944, "Asia/Makassar"),
        IndoCity("Banjarbaru", "Kalimantan Selatan", -3.4423, 114.8336, "Asia/Makassar"),
        IndoCity("Samarinda", "Kalimantan Timur", -0.5022, 117.1536, "Asia/Makassar"),
        IndoCity("Balikpapan", "Kalimantan Timur", -1.2654, 116.8312, "Asia/Makassar"),
        IndoCity("Bontang", "Kalimantan Timur", 0.1322, 117.4906, "Asia/Makassar"),
        IndoCity("Tarakan", "Kalimantan Utara", 3.3274, 117.5775, "Asia/Makassar"),
        IndoCity("Nunukan", "Kalimantan Utara", 4.1361, 117.6740, "Asia/Makassar"),

        // ---- Sulawesi ----
        IndoCity("Manado", "Sulawesi Utara", 1.4748, 124.8421, "Asia/Makassar"),
        IndoCity("Bitung", "Sulawesi Utara", 1.4407, 125.1209, "Asia/Makassar"),
        IndoCity("Tomohon", "Sulawesi Utara", 1.3245, 124.8347, "Asia/Makassar"),
        IndoCity("Gorontalo", "Gorontalo", 0.5375, 123.0568, "Asia/Makassar"),
        IndoCity("Palu", "Sulawesi Tengah", -0.9003, 119.8779, "Asia/Makassar"),
        IndoCity("Makassar", "Sulawesi Selatan", -5.1477, 119.4327, "Asia/Makassar"),
        IndoCity("Parepare", "Sulawesi Selatan", -4.0167, 119.6210, "Asia/Makassar"),
        IndoCity("Palopo", "Sulawesi Selatan", -2.9925, 120.1969, "Asia/Makassar"),
        IndoCity("Kendari", "Sulawesi Tenggara", -3.9985, 122.5127, "Asia/Makassar"),
        IndoCity("Bau-Bau", "Sulawesi Tenggara", -5.4683, 122.5961, "Asia/Makassar"),
        IndoCity("Mamuju", "Sulawesi Barat", -2.6748, 118.8884, "Asia/Makassar"),

        // ---- Bali / NTB / NTT ----
        IndoCity("Denpasar", "Bali", -8.6705, 115.2126, "Asia/Makassar"),
        IndoCity("Singaraja", "Bali", -8.1120, 115.0883, "Asia/Makassar"),
        IndoCity("Mataram", "Nusa Tenggara Barat", -8.5833, 116.1167, "Asia/Makassar"),
        IndoCity("Bima", "Nusa Tenggara Barat", -8.4666, 118.7269, "Asia/Makassar"),
        IndoCity("Kupang", "Nusa Tenggara Timur", -10.1772, 123.6070, "Asia/Makassar"),

        // ---- Maluku & Papua ----
        IndoCity("Ambon", "Maluku", -3.6954, 128.1814, "Asia/Jayapura"),
        IndoCity("Tual", "Maluku", -5.6361, 132.7432, "Asia/Jayapura"),
        IndoCity("Ternate", "Maluku Utara", 0.7833, 127.3667, "Asia/Jayapura"),
        IndoCity("Tidore Kepulauan", "Maluku Utara", 0.6878, 127.4317, "Asia/Jayapura"),
        IndoCity("Sofifi", "Maluku Utara", 0.7295, 127.5781, "Asia/Jayapura"),
        IndoCity("Sorong", "Papua Barat Daya", -0.8762, 131.2558, "Asia/Jayapura"),
        IndoCity("Manokwari", "Papua Barat", -0.8615, 134.0620, "Asia/Jayapura"),
        IndoCity("Jayapura", "Papua", -2.5337, 140.7181, "Asia/Jayapura"),
        IndoCity("Merauke", "Papua Selatan", -8.4934, 140.4015, "Asia/Jayapura"),
        IndoCity("Biak", "Papua", -1.1818, 136.0946, "Asia/Jayapura"),
        IndoCity("Nabire", "Papua Tengah", -3.3671, 135.4946, "Asia/Jayapura"),
        IndoCity("Wamena", "Papua Pegunungan", -4.0788, 138.9526, "Asia/Jayapura"),
    )

    /**
     * Case-insensitive substring search across both city and province
     * names. Empty / blank query returns the full list (capped to
     * [limit]) so the dialog has something to show on first open.
     *
     * Results are roughly ranked: exact city-name prefix matches first,
     * then province-name matches, then any substring. Stable within
     * each tier (the source order is already curated).
     */
    fun search(query: String, limit: Int = 50): List<IndoCity> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return ALL.take(limit)

        val starts  = mutableListOf<IndoCity>()
        val provHit = mutableListOf<IndoCity>()
        val anywhere = mutableListOf<IndoCity>()
        for (c in ALL) {
            val cityLc = c.name.lowercase()
            val provLc = c.province.lowercase()
            when {
                cityLc.startsWith(q)             -> starts.add(c)
                provLc.startsWith(q)             -> provHit.add(c)
                cityLc.contains(q) || provLc.contains(q) -> anywhere.add(c)
            }
        }
        return (starts + provHit + anywhere).take(limit)
    }
}
