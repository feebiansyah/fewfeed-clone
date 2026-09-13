# FewFeed One Card Web Flow

**Hasil utama:** caller tombol ditemukan. `CREATE ONE-CARD POST` → komponen `km` → `window.ff.qjn` → wrapper aktivasi → `createOneCardViaAdCreative` → upload image → create creative → **langsung GET creative, kemudian polling maksimal 15 kali dengan jeda 4 detik ketika story ID belum ada** → GraphQL publish atau schedule. Tidak ada pembuatan campaign/adset/Ad atau GraphQL sebelum GET pada jalur image ini.

Ini hasil analisis source publik, bukan hasil menjalankan fitur. Tidak ada request ke Facebook/Meta, tidak ada penggunaan cookie/token/session, tidak ada eksekusi extension/VM/frontend, dan tidak ada perubahan aplikasi utama. Pengambilan jaringan hanya GET HTML/JavaScript/source-map FewFeed publik. Laporan ini adalah satu-satunya artefak baru di luar `scripts/research/fewfeed-web/`.

## Entry point

Target: [halaman publik One Card](https://fewfeed.net/tool/fb-one-card-picture-carousel).

Rantai resource yang dibuktikan dari HTML dan kode:

1. HTML memuat `/app-2b7aa614.js` sebagai script biasa dan inline `import("/assets/index-DOs1I5qe.js")`.
2. RSC menyatakan route `/tool/fb-one-card-picture-carousel` dengan module ID `f71cd2228dd8`.
3. `index-DOs1I5qe.js` memetakan ID tersebut ke export `export_f71cd2228dd8` dari `/assets/worker-entry-BWLa81Qz.js`.
4. Bundle worker mengekspor `Ey`, yang berisi `default: km`. **`km` adalah komponen halaman image One Card.** Nama file worker tidak berarti publisher berjalan sebagai extension service worker; di sini ia menjadi modul frontend melalui import.
5. `app-2b7aa614.js` mengisi API `window.ff`; kode bisnisnya menggunakan virtual-machine obfuscation.

Bukti publik: [app bundle](https://fewfeed.net/app-2b7aa614.js), [module loader](https://fewfeed.net/assets/index-DOs1I5qe.js), [frontend bundle](https://fewfeed.net/assets/worker-entry-BWLa81Qz.js). Salinan lokal, status GET, timestamp akuisisi, ukuran, dan SHA-256 teks tersanitasi ada di [resources.json](../scripts/research/fewfeed-web/resources.json).

Resource yang diambil: HTML, app bundle, index, worker-entry, rolldown-runtime, preload-helper, framework, dan query. Beacon analytics di luar origin tidak diambil; identifier analytics dalam HTML disamarkan. Dynamic import fitur lain seperti Excel/emoji tidak diperlukan untuk handler ini dan tidak dijalankan/diambil. Ketiga kandidat `.map` untuk app, index, dan worker-entry mengembalikan 404; tidak ditemukan `sourceMappingURL` pada ketiga bundle tersebut. Ini tidak membuktikan tidak ada source map lain di seluruh server.

### Metode decode dan navigasi bukti

Semua downloaded JavaScript disimpan sebagai `.txt`. Parser Babel hanya memparse/beautify; tidak mengimpor atau menjalankan source unduhan. VM juga tidak dijalankan: helper menyalin algoritme decoding integer/string sebagai transformasi data, kemudian mencetak tiap opcode dan operand sebagai pseudocode.

- 276101 integer terurai dari literal terenkode.
- Tabel string berada pada indeks 241490, panjang 34608 code unit.
- Setelah tabel dipisahkan: 241491 word; pointer awal program adalah **1**, bukan 0.
- 68318 instruksi terdisassembly; 5956 target jump/function/catch/finally numerik cocok dengan batas instruksi. Word terakhir adalah trailer, bukan instruksi.
- Cabang generator async dipetakan melalui properti state `n`, nilai hasil `v`, dan return/yield. Perbandingan konstan dibaca manual; VM call tidak dieksekusi.

`PC` dalam laporan berarti indeks word di [vm-disassembly.txt](../scripts/research/fewfeed-web/vm-disassembly.txt), bukan nomor baris source asli. [one-card-evidence.txt](../scripts/research/fewfeed-web/one-card-evidence.txt) mengumpulkan rentang yang relevan. [one-card-component.txt](../scripts/research/fewfeed-web/one-card-component.txt) memuat ekstraksi komponen frontend. Pencarian semua pola yang diminta pada seluruh bundle yang diambil serta hasil decode tercatat di [search-coverage.json](../scripts/research/fewfeed-web/search-coverage.json).

Reproduksi **offline**, menggunakan resource lokal yang sudah diambil:

```text
node scripts/research/fewfeed-web/extract-html.cjs
node scripts/research/fewfeed-web/decode-vm.cjs
node scripts/research/fewfeed-web/inspect-static.cjs
```

`fetch-public.cjs` adalah helper akuisisi terpisah: hanya GET pada origin FewFeed dan path HTML/static JS/map, tanpa cookie jar, Authorization, penyimpanan response headers, atau eksekusi body. Tidak perlu menjalankannya untuk mereproduksi analisis offline.

Verifikasi akhir: [verification.json](../scripts/research/fewfeed-web/verification.json) mencatat 8 resource publik tersimpan, 7 bundle lolos parsing dan pemeriksaan hash, 3 source-map 404, binding handler/konstanta polling cocok dengan disassembly, dan hash keempat file extension tetap sama. Pemeriksaan literal tidak menemukan pola token/session yang diuji. Jalankan `node scripts/research/fewfeed-web/verify-static.cjs` untuk mengulang pemeriksaan offline; hasil ini bukan validasi keberhasilan request Meta.

## Button handler

Bukti: `worker-entry.pretty.txt` fungsi `km`, tombol sekitar baris 17984–18029; versi ringkas ada di `one-card-component.txt`.

Handler klik:

1. Memastikan account, Page terpilih, image URL, link URL, dan ad account tersedia.
2. Membuat AbortController dan mereset status UI.
3. Menunggu `window.ff.qjn(options)`.
4. Jika return value truthy, UI menampilkan Posted/Scheduled dan ID; jika null, menampilkan kegagalan. AbortError dibedakan dari error biasa.

| Option qjn | Asal frontend |
| --- | --- |
| `pageId` | Selected Page ID |
| `adAccountId` | Ad account terpilih |
| `imageUrl` | Input Cover Image / URL hasil upload |
| `title`, `description`, `linkUrl`, `displayUrl` | Input form |
| `ctaType` | Select CTA; default `LEARN_MORE` |
| `message` | Primary Text, atau undefined jika kosong |
| `scheduleTime` | Date terpilih jika toggle Schedule aktif; selain itu undefined |
| `signal`, `onProgress` | AbortSignal dan updater status |
| `dtsg`, `userId` | Referensi state account; nilainya tidak diambil atau ditampilkan |
| `adsToken` | **`selectedPage.accessToken || token` dari hook Page**, bukan variabel adsToken account yang digunakan uploader UI |

Perbedaan sumber credential terakhir terbukti dari handler, tetapi tidak membuktikan jenis token aktual, scopes, atau penyebab kegagalan standalone. Tidak ada credential yang diperlukan untuk membaca hubungan variabel ini.

Binding yang membuktikan call chain:

| PC | Hubungan |
| --- | --- |
| 11039–11056 | Slot 1842 → function@81784; slot 1843 adalah wrapper async internal |
| 13454–13457 | Slot 1842 diekspor dengan nama `createOneCardViaAdCreative` |
| 16147–16166 | `window.ff.qjn = activationWrapper(slot1842)` |
| 110542–110911 | Wrapper memeriksa aktivasi lalu meneruskan argumen asli ke fungsi |
| 81906–82048 | Menyiapkan local/state generator bisnis |
| 82049–85814 | State machine upload, builder, create, polling, publish/schedule |

Gate aktivasi dapat memanggil **POST FewFeed `/api/auth/activate`** sebelum fungsi bisnis jika state aktivasi belum tersedia. Ini bukan Meta request dan tidak pernah dipanggil dalam penelitian. Body adalah envelope aplikasi yang ditransformasikan dari metadata seperti nonce/timestamp/fingerprint; response text didecode untuk status aktivasi. Protokol aktivasi bukan mekanisme pembentukan story ID dan tidak direplikasi di sini.

## Image upload

Ada **dua kesempatan upload**, sehingga urutan capture tergantung interaksi pengguna:

- Pemilihan file pada UI memanggil `window.ff.l88(adAccountId, previewDataUrl, accountAdsToken)`; URL hasilnya menjadi Cover Image.
- Saat klik Create, `qjn` kembali memanggil helper upload untuk `imageUrl` yang ada. Ia tidak memeriksa apakah URL itu sudah hasil adimages. URL tersebut dapat di-fetch dan di-upload ulang.

`l88` → wrapper aktivasi → slot 1836, fungsi bernama `uploadAdImage`, PC 76724–79039. `qjn` memanggil slot 1836 langsung pada PC 83807–83825.

Konversi sumber image:

| Input helper | Konversi |
| --- | --- |
| File | FileReader → data URL → bagian setelah koma sebagai base64; nama dari File |
| String `data:` | Ambil bagian setelah koma; nama `image.jpg` |
| URL biasa | GET URL → Blob → ArrayBuffer → Uint8Array → string byte → base64; nama dari segmen path terakhir, tanpa query |

GET image URL merupakan request runtime yang dibentuk dari input, bukan request penelitian. Pada helper ini tidak ada AbortSignal yang diteruskan ke fetch image atau POST upload.

Upload utama:

```text
POST https://graph.facebook.com/v21.0/act_<AD_ACCOUNT_ID>/adimages/
     ?access_token=<OMITTED>&method=post&__cppo=1&fields=url&fewfeedcors=0
```

Body FormData yang dibangun, dengan nilai session ditiadakan:

| Field | Nilai struktural |
| --- | --- |
| `bytes` | Base64 image, tanpa prefix data URL |
| `access_token` | Omitted credential reference |
| `image_creation_source` | `ADVERTISER_MANUAL_UPLOAD` |
| `include_headers` | `false` (string) |
| `locale` | `en_US` |
| `method` | `post` |
| `name` | Nama file |
| `pretty` | `0` |
| `show_in_giyimage_library` | `true` (ejaan literal source) |
| `suppress_http_code` | `1` |
| `fb_api_caller_class` | `RelayModern` |
| `__ad_account_id` | Ad account ID |

Respons: mengambil `images`, memilih **key pertama** melalui Object.keys, lalu mengembalikan `{hash: image.hash || '', url: image.url || ''}`. qjn memakai **url**, bukan hash, untuk `picture`. Jika tidak ada images/error tertangkap, helper mengembalikan null.

Jika upload gagal atau tidak menghasilkan URL, qjn **langsung fallback** ke `createOneCardPost` (slot 1840, function@80720), bukan membuat creative. Fallback melakukan POST Graph `/<PAGE_ID>/feed` dengan JSON `{link,name,description,picture,call_to_action}` dan optional caption pada helper. Akan tetapi caller fallback tidak meneruskan `displayUrl`, `message`, atau `scheduleTime`; hasilnya hanya `.id || null`. Jadi fallback tidak mempertahankan seluruh perilaku jalur schedule.

## Creative creation

Jalur normal image: upload menghasilkan URL → status Creating ad creative → bangun `link_data` → POST JSON.

```text
POST https://graph.facebook.com/v21.0/act_<AD_ACCOUNT_ID>/adcreatives
     ?access_token=<OMITTED>&fields=effective_object_story_id&fewfeedcors=0
Content-Type: application/json
```

Body struktural:

```text
object_story_spec:
  page_id: <PAGE_ID>
  link_data:
    link: <LINK_URL>
    message: <PRIMARY_TEXT_OR_FALLBACK>
    name: <TITLE>
    description: <DESCRIPTION>
    multi_share_optimized: true
    multi_share_end_card: true
    picture: <URL_FROM_ADIMAGES>
    caption: <DISPLAY_URL_IF_TRUTHY>
    call_to_action: <CONDITIONAL_CTA>
```

**Perbedaan dengan bukti Network pengguna:** bundle publik yang diambil membangun `multi_share_end_card:true`, bukan false. Bukti PC 84175–84181 menunjukkan `0` → logical-not → true. `multi_share_optimized` juga true. Jangan mengubah hasil decode agar cocok dengan perkiraan capture lama; versi/waktu/source capture belum terhubung secara pasti.

CTA ditambahkan kecuali `NO_BUTTON_V2`. Nilai default memakai `{type, value:{link}}`; LIKE_PAGE memakai `{page:pageId}`, JOIN_GROUP memakai `{group_id:<hasil ekstraksi link>,link}`. Untuk NO_BUTTON_V2 title/description diganti spasi dan CTA dihilangkan; opsi tersebut tersembunyi dari daftar UI biasa.

Builder juga memiliki cabang role/watermark: role numerik >=5 dapat mengganti description/caption/message melalui helper watermark. Pada cabang normal, message memilih `message || watermarkText || title`; cabang watermark memilih `watermarkText || message || title`. `picture` untuk halaman ini berasal dari upload URL. Cabang video ada dalam fungsi bersama, tetapi halaman `km` tidak mengirim videoUrl.

PC 84531–84710: satu fetch POST creative. PC 84712–84833: parse JSON lalu ambil **response.id**. Jika id tidak tersedia, return null. Walaupun POST meminta `fields=effective_object_story_id`, qjn **tidak menggunakan field itu dari respons POST** untuk mengambil keputusan berikutnya.

Tidak ada campaign, adset, Ad, atau `object_story_id` yang dibangun sebagai langkah antara POST creative dan polling. Tidak ada field `published:false` atau request Page feed pada jalur normal sebelum polling. Backing story yang belum dipublish konsisten dengan langkah berikutnya, tetapi status server-side-nya tidak diobservasi saat penelitian.

## effective_object_story_id retrieval

**Mekanisme yang ditemukan adalah read-after-create dengan polling, bukan langkah materialisasi tambahan dari frontend.**

Urutan tepat pada qjn:

1. Tunggu POST creative dan JSON parsing selesai; ambil `creative.id`.
2. Set status Waiting for story ID; set story ID null dan penghitung 0.
3. **GET pertama langsung**, tanpa delay pendahuluan:

   ```text
   GET https://graph.facebook.com/v21.0/<CREATIVE_ID>
       ?fields=effective_object_story_id&access_token=<OMITTED>&fewfeedcors=0
   ```

4. Parse JSON. Jika `effective_object_story_id` truthy, simpan dan keluar loop.
5. Jika belum ada, tunggu **4000 ms** dengan Promise/setTimeout, naikkan penghitung, ulangi selama penghitung <15.
6. Jika 15 percobaan tidak menghasilkan ID, return null. Delay juga terjadi setelah respons kosong terakhir, sehingga total waktu tunggu terjadwal dapat mencapai 60 detik, ditambah latency request; pada sukses lebih awal waktunya lebih pendek.
7. Cek signal.aborted sebelum GET; delay memiliki listener abort yang membatalkan timer dan menolak Promise. Fetch GET juga menerima signal.

Bukti PC: 84911–84974 (inisialisasi/batas 15), 85087–85177 (GET), 85229–85358 (field dan break), 85360–85426 (delay/increment), 85923–86091 (4000 ms dan abort).

Tidak ada `await createAd`, POST lain, GraphQL, atau pembuatan unpublished Page post eksplisit di interval POST creative → GET pertama → GET berikutnya. JSON error tanpa field dapat diperlakukan sebagai field belum tersedia; fetch rejection/JSON parse rejection dapat keluar sebagai exception, bukan retry yang ditangani lokal.

| Pertanyaan | Jawaban untuk handler target |
| --- | --- |
| Langsung GET creative? | Ya, setelah menerima creative.id |
| Polling? | Ya, maksimal 15 GET |
| Menunggu? | Ya, 4 detik setelah GET yang tidak menghasilkan field; tidak sebelum GET pertama |
| Membuat Ad sementara? | Tidak pada jalur yang ditelusuri |
| Endpoint materialisasi lain? | Tidak ditemukan pada jalur tersebut |
| GraphQL sebelum GET? | Tidak; publish/schedule baru setelah ID ditemukan |
| Menggunakan field dari respons POST? | Tidak pada qjn; hanya memakai creative.id dari POST |
| Membuat unpublished post eksplisit? | Tidak; tidak ada request terpisah sebelum polling |

Ini menjawab **bagaimana FewFeed mencoba memperoleh field**, bukan membuktikan penyebab Meta menyediakan atau menahan field pada akun tertentu. Eventual availability adalah asumsi perilaku yang diandalkan polling. Penyebab pasti field hilang pada test standalone masih belum terbukti tanpa membandingkan payload, jenis credential/scopes, respons error, dan rentang waktu test yang disanitasi.

## Publish flow

Jika story ID sudah ada dan tidak ada scheduleTime/isDraft, qjn memanggil slot 1808 (PC 85710–85775), helper function@59495.

Pada **halaman target**, handler tidak mengirim `pageAccessToken`. Karena itu helper melewati cabang publish resmi melalui token Page dan langsung membentuk GraphQL:

```text
POST https://www.facebook.com/api/graphql/
Body: FormData
fb_api_req_friendly_name: BusinessToolsContentManagementPublishingActionMutation
doc_id: 5001941423228398
variables:
  input:
    client_mutation_id: "3"
    actor_id: <PAGE_ID>
    story_ids: ["S:_I<PAGE_ID>:<POST_ID>"]
    page_id: <PAGE_ID>
    is_published: true
```

Story string dibangun dari `"S:_I" + effectiveStoryId.replace('_', ':')`, bukan query untuk mencari ID baru. Form juga membawa `av`, field session `fb_dtsg`/`__user` yang nilainya ditiadakan, dan metadata `__aaid`, `__a`, `__req`, `dpr`, `__comet_req`, `__dyn`, `__csr`, `fb_api_caller_class`, `server_timestamps`, `__jssesw`. Tidak ada nilai session yang disalin dalam laporan.

Helper membaca response.text, menghapus suffix streaming yang dimulai newline `{"label...`, mencoba JSON.parse, lalu menguji `data.publishing_action.mutated_story_ids`. Jika parsing gagal, fallback hanya regex keberadaan kata `mutated_story_ids`; ini pemeriksaan lemah, bukan bukti keberhasilan server yang kuat.

**Cabang helper bersama, tidak aktif dari handler km:** bila `pageAccessToken` disediakan caller lain, mencoba POST Graph `/<EFFECTIVE_STORY_ID>?access_token=<OMITTED>&fewfeedcors=0` dengan FormData `is_published:'true'`, optional query `timeline_visibility=hidden`. Bila respons menunjukkan success/id/post_id dan tanpa error, return true; bila gagal, berlanjut ke GraphQL. Cabang ini berada **setelah** story ID diperoleh dan tidak menjelaskan pembentukannya.

**Keterbatasan hasil UI:** qjn menunggu helper publish tetapi tidak memeriksa boolean hasilnya. Setelah helper resolve—bahkan false—qjn mengembalikan effective story ID. Jadi UI Posted tidak cukup sebagai bukti publish berhasil.

## Schedule flow

Jika scheduleTime truthy atau isDraft truthy, qjn memanggil slot 1824, helper function@70469. Toggle schedule pada UI mengirim Date; default pilihan UI sekitar 30 menit di depan dan role>=5 diberi gate Basic plan.

```text
POST https://business.facebook.com/api/graphql/
Body: FormData
fb_api_req_friendly_name: BusinessContentManagerRescheduleContentMutation
doc_id: 5001941423228398
variables:
  input:
    client_mutation_id: "4"
    actor_id: <PAGE_ID>
    story_ids: ["S:_I<PAGE_ID>:<POST_ID>"]
    page_id: <PAGE_ID>
    scheduled_publish_time: floor(scheduleDate.getTime() / 1000)
```

`doc_id` yang sama dengan publish adalah literal source pada kedua helper, bukan asumsi bahwa kedua operasi valid di server saat ini. Metadata form mencakup av, field session yang dihilangkan nilainya, `__a`, `__req`, `__comet_req`, `dpr`, `__dyn`, `__csr`, `fb_api_caller_class`, `server_timestamps`.

Jika caller menggunakan isDraft tanpa scheduleTime, fungsi memilih Date.now()+86400000, yaitu satu hari ke depan; **halaman target tidak mengirim isDraft**. Ini bukan bukti draft server yang sesungguhnya. Helper schedule mengecek mutated_story_ids dengan logika serupa publish. qjn juga mengabaikan boolean hasilnya dan mengembalikan ID jika helper resolve.

Tidak ada timer lokal yang menunggu hingga jam publish. Frontend mengirim timestamp ke mutation lalu selesai. Keberhasilan penjadwalan server tidak diuji.

## Bridge messages

**Jalur target tidak memakai PROXY_FETCH/PROXY_UPLOAD, window.postMessage, atau chrome.runtime.sendMessage.** Request bisnis dibentuk dalam app bundle dan dipanggil melalui `window.fetch` langsung. Pencarian bridge string pada disassembly dan frontend bundle tidak menemukan protokol bridge tersebut.

Rantai source yang terbukti:

```text
React button → window.ff.qjn → activation wrapper → business helper → window.fetch
```

Rantai yang tidak boleh diklaim sebagai fakta untuk target ini:

```text
qjn → content.js → sendMessage(PROXY_FETCH) → bg.js
```

Marker `fewfeedcors=0` menunjukkan kompatibilitas yang diharapkan dengan mekanisme header/CORS extension. Namun [manifest extension terdahulu](../reference/FewFeedV3.9.3/manifest.json) hanya mencakup `fewfeed.app` dan `fewfeed.online`, dan rule dasar DNR-nya digandakan untuk kedua origin tersebut. **`fewfeed.net` tidak tercakup.** Jadi pengambilan source saat ini tidak membuktikan extension V3.9.3 lokal adalah extension yang dipakai oleh website/capture Network ini.

Perbandingan dengan [laporan extension](fewfeed-one-card-analysis.md):

| Kesimpulan lama | Hasil baru |
| --- | --- |
| Extension hanya bridge/header/proxy generik | Tetap sesuai artefak lokal |
| Caller website belum tersedia | Ditemukan dalam app VM + worker frontend |
| Story ID retrieval belum diketahui | qjn: langsung GET, polling 15 kali, jeda 4 detik |
| Publish/schedule belum diketahui | Dua GraphQL helper sesudah story ID; operation/doc_id tersedia di source |
| Potensi jalur fetch langsung | Terbukti dipakai handler target |
| Kompatibilitas extension dengan website | Belum terbukti; domain target berbeda |

## Request sequence

Tabel ini memisahkan jalur normal dan cabang opsional. Placeholder credential berarti nama referensi saja; tidak ada nilai aktual.

| Step | Method | Endpoint yang dibentuk | Request body | Response field dipakai | Tujuan/kondisi |
| --- | --- | --- | --- | --- | --- |
| P0 | POST | FewFeed `/api/auth/activate` | Envelope metadata aplikasi tertransformasi; tidak direplikasi | Response text → status activated | Gate wrapper jika belum aktif; bukan request Meta; tidak dilakukan dalam riset |
| U0 | Lokal atau GET | Data URL/File atau `<IMAGE_URL>` | Tidak ada body untuk GET | FileReader/result atau blob/arrayBuffer | Menyiapkan base64; GET hanya bila input URL biasa |
| U1 | POST | Graph v21 `act_<ID>/adimages/` + query di bagian Image upload | FormData bytes + metadata upload | `images[first].url`, `.hash` | Bisa terjadi saat file dipilih dan kembali saat Create |
| C1 | POST | Graph v21 `act_<ID>/adcreatives?…&fields=effective_object_story_id&fewfeedcors=0` | JSON object_story_spec.page_id/link_data | **id** | Membuat creative; tidak membuat Ad |
| R1–R15 | GET | Graph v21 `<CREATIVE_ID>?fields=effective_object_story_id&…&fewfeedcors=0` | Tidak ada | effective_object_story_id | GET langsung; ulang setelah 4 detik jika kosong, maksimal 15 |
| P1 | POST | `https://www.facebook.com/api/graphql/` | FormData publishing mutation + variables | data.publishing_action.mutated_story_ids → boolean | Publish biasa, sesudah R sukses |
| S1 | POST | `https://business.facebook.com/api/graphql/` | FormData reschedule mutation + variables/timestamp | data.publishing_action.mutated_story_ids → boolean | Menggantikan P1 untuk schedule |
| F1 | POST | Graph v21 `<PAGE_ID>/feed?access_token=<OMITTED>&fewfeedcors=0` | JSON link/name/description/picture/call_to_action | id | Alternatif saat upload tidak mengembalikan URL; tidak melalui C/R/GraphQL |
| Palt | POST | Graph v21 `<EFFECTIVE_STORY_ID>?access_token=<OMITTED>&fewfeedcors=0` + optional timeline_visibility | FormData is_published=true | success/id/post_id dan tidak error | Helper bersama jika caller menyediakan pageAccessToken; tidak diaktifkan handler km |

Preload Page/ad-account dan navigasi/auth UI umum merupakan prasyarat pemilihan account, bukan bagian interval creative→story. Banyak endpoint lain berada dalam bundle aplikasi bersama; tidak dicampur menjadi sequence One Card hanya karena stringnya ditemukan.

Diagram teks jalur normal:

```text
User memilih image (opsional upload awal)
↓
User menekan CREATE ONE-CARD POST / SCHEDULE
↓
km → window.ff.qjn → gate aktivasi FewFeed
↓
GET image URL (bila URL biasa) → bytes base64
↓
POST /v21.0/act_<ID>/adimages/
↓ images[first].url
POST /v21.0/act_<ID>/adcreatives
↓ response.id = CREATIVE_ID
GET /v21.0/<CREATIVE_ID>?fields=effective_object_story_id
├─ belum ada → tunggu 4 detik → GET lagi (maksimal 15 GET)
├─ tetap tidak ada setelah batas → return null
└─ ada → simpan PAGE_ID_POST_ID
          ↓
          ubah menjadi S:_IPAGE_ID:POST_ID
          ├─ publish → www.facebook.com/api/graphql/
          └─ schedule → business.facebook.com/api/graphql/ + Unix timestamp
          ↓
          return PAGE_ID_POST_ID → UI hasil
```

Tidak ada kotak request tersembunyi yang ditemukan di antara C1 dan R1. Timer hanya mengulang pembacaan; ia tidak mengirim request pembuatan objek lain.

## Unknowns

1. **Penyebab server-side field tersedia/tidak tersedia.** Polling menjelaskan strategi frontend, bukan membuktikan Meta selalu mematerialisasi backing story setelah create creative. Perbedaan payload/token/Page/account/permission test standalone belum diperiksa.
2. **Kesetaraan dengan capture lama.** Tanggal/build capture tidak tersedia. `multi_share_end_card` berbeda, dan endpoint upload source memakai trailing slash serta query tambahan. Bukti Network pengguna diperlakukan sebagai konteks terpisah, bukan response hasil riset ini.
3. **Extension yang kompatibel dengan fewfeed.net.** Versi lokal hanya mencakup .app/.online. Header/cookie yang benar-benar diterapkan saat website dipakai tidak dapat ditentukan dari source target saja.
4. **Validitas mutation/doc_id saat ini.** Dua helper menyertakan doc_id sama; tidak ada request Meta untuk memvalidasi mapping maupun response schema aktual.
5. **Keberhasilan publish/schedule.** qjn mengabaikan boolean helper; UI success dapat muncul walaupun helper return false. Hanya source diperiksa, tidak ada post dibuat.
6. **Protokol aktivasi FewFeed dan backend.** Gate ditemukan tetapi session-dependent response dan backend implementasi tidak tersedia, tidak dipanggil, tidak dibuat ulang. Ini prasyarat produk, bukan langkah creative materialization.
7. **Implementasi setara yang andal.** Rancangan error handling, concurrency, idempotency, serta pemulihan state tidak bisa disamakan dengan sekadar meniru return value source. Tidak ada implementasi publisher dibuat dalam penelitian ini.

## Final conclusion

**Flow frontend inti sudah cukup lengkap untuk dibuat spesifikasi ulang:** handler, alias fungsi, upload bytes/base64, payload creative, polling story ID, serta publish/schedule berikut payload dan doc_id telah ditemukan secara statis.

Jawaban khusus: **FewFeed langsung GET creative, lalu polling sampai 15 kali dengan delay 4 detik. Tidak ada pembuatan Ad sementara atau GraphQL sebelum GET pada jalur target ini.** Field dari respons POST creative tidak dipakai oleh qjn; creative.id dipakai untuk GET berikutnya.

**Belum cukup untuk menjamin clone/publisher akan berfungsi end-to-end**, karena domain/extension runtime berbeda, validitas internal GraphQL tidak diuji, dan penyebab test standalone belum dipastikan. Temuan baru mempersempit masalah menjadi pembacaan berulang dan prasyarat/payload runtime; tidak membuktikan bahwa menambahkan delay saja pasti menyelesaikannya.

Tidak ada source reference/aplikasi utama, database, atau Prisma yang diubah. Tidak ada commit atau push.
