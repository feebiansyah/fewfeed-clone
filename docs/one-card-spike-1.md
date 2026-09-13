# One Card Spike 1

Status: implementasi bridge, payload builder, transport terbatas, polling, dan UI tersedia. **Pembuktian live `effective_object_story_id` masih BLOCKED oleh autentikasi.** Tidak ada request Meta, login Facebook, pembacaan cookie/session, atau eksekusi extension yang dilakukan selama implementasi dan pengujian ini.

## File

- `extension/manifest.json`: Manifest V3 dan pembatasan host.
- `extension/content.js`: bridge isolated-world, validasi origin/source, proyeksi response aman.
- `extension/background.js`: Chrome runtime entry dan progress ke frame asal.
- `extension/worker.mjs`: validasi sender/message, satu run aktif, orkestrasi dan error.
- `extension/core.mjs`: tiga operasi Graph, validasi input, payload builder, transport, polling, sanitasi error.
- `extension/auth.mjs`: blocker autentikasi eksplisit, tanpa extractor atau input credential.
- `extension/core.test.mjs`, `extension/bridge.test.mjs`: pengujian offline dengan respons sintetis.
- `app/dev/one-card-spike/page.tsx`: gate development; production memanggil `notFound()`.
- `app/dev/one-card-spike/spike-form.tsx`: form, deteksi extension, progress, hasil, dan error.
- `docs/superpowers/plans/2026-09-13-one-card-spike-1.md`: rencana implementasi.
- `docs/one-card-spike-1.md`: dokumentasi ini.

Tidak ada modifikasi reference FewFeed, database, Prisma, atau fitur utama. Tidak ada dependency baru, commit, atau push.

## Arsitektur

```text
Next development page (http://localhost:3000/dev/one-card-spike)
  window.postMessage(FEWCLONE_PING / FEWCLONE_RUN, requestId)
    -> isolated content.js
      -> chrome.runtime.sendMessage
        -> background.js -> worker.mjs -> core.mjs
          -> auth.mjs -> AUTH_BLOCKED (build saat ini STOP di sini)

Flow core yang diuji dengan respons sintetis:
  UPLOAD_AD_IMAGE -> CREATE_ONE_CARD_CREATIVE
    -> GET_CREATIVE_STORY_ID langsung
    -> jika kosong: tunggu 4000 ms, GET lagi, maksimum 15 GET
    -> story ID ditemukan -> return -> STOP

Progress: background -> chrome.tabs.sendMessage -> content -> window.postMessage
Hasil akhir: runtime response -> content -> window.postMessage -> UI
```

Tidak diperlukan `inject.js`: content script dapat mendengarkan `window.postMessage` dari isolated world. Tidak ada akses page-world Facebook. Website hanya mengirim form dan image; tidak mengirim URL request Graph, method, header, atau credential. Tiga nama operasi adalah allowlist **internal worker**, bukan proxy yang dapat dipanggil bebas oleh website. Website meminta satu run lengkap agar sequence dimiliki extension.

`FEWCLONE_EVENT` hanya meneruskan status, kode error tetap, boolean/state auth, Creative ID, Story ID, dan attempt sesuai schema. Teks error mentah Meta tidak diteruskan. UI memetakan kode ke pesan lokal. Nilai image hasil upload tetap di worker; hanya dipakai sebagai payload creative.

## Auth blocker

Laporan web menunjukkan caller memakai `selectedPage.accessToken || token`, tetapi tidak membuktikan mekanisme memperoleh otorisasi Graph hanya dari sesi browser. Karena itu `getAuthorization()` selalu melempar `AUTH_BLOCKED` sebelum `fetch`.

**Jangan paste token atau cookie. Login Facebook saja tidak membuka blocker ini.** Tidak ada cookie permission, extractor DOM, script injection Facebook, pembacaan browser storage, token endpoint, atau penyimpanan credential. Penyelesaian blocker membutuhkan metode autentikasi yang dibuktikan dan disetujui terlebih dahulu; tidak ada toggle/env/form rahasia untuk melewatinya.

Transport mempunyai dependency internal untuk otorisasi agar dapat diuji dengan string sintetis. Apabila metode auth sah ditambahkan dalam pekerjaan terpisah, transport menempatkan otorisasi hanya di header outbound extension, memakai `credentials: omit`, `redirect: error`, dan timeout 25 detik. Website tidak bisa memasok dependency ini. Build ini tidak memiliki mode mock yang menyamar sebagai keberhasilan live.

## Endpoint allowlist dan payload

Versi `v21.0` dipatok mengikuti laporan; kompatibilitas live versi/scopes belum diverifikasi. Hanya `buildRequest()` yang membentuk URL dan method; parameter tambahan/URL arbitrary ditolak sebelum auth maupun fetch.

| Operasi | Method | Endpoint | Body / hasil yang digunakan |
| --- | --- | --- | --- |
| UPLOAD_AD_IMAGE | POST | `https://graph.facebook.com/v21.0/act_<ID>/adimages?fields=url` | FormData `bytes`, nama tetap image.png/jpg, metadata upload; ambil URL dari key pertama `images` |
| CREATE_ONE_CARD_CREATIVE | POST | `https://graph.facebook.com/v21.0/act_<ID>/adcreatives?fields=effective_object_story_id` | JSON `object_story_spec`; ambil `id` |
| GET_CREATIVE_STORY_ID | GET | `https://graph.facebook.com/v21.0/<CREATIVE_ID>?fields=effective_object_story_id` | Tanpa body; ambil `effective_object_story_id` |

Image: hanya file PNG/JPEG maksimal 5 MiB. FileReader mengubahnya menjadi base64 tanpa prefix. Worker memeriksa format base64, ukuran decoded, dan signature; ini bukan decoder image penuh. Tidak ada fetch ke URL image arbitrary. Nama file asli tidak dikirim ke Meta; digunakan nama tetap.

Metadata upload mengikuti laporan: `image_creation_source=ADVERTISER_MANUAL_UPLOAD`, `include_headers=false`, `locale=en_US`, `method=post`, `pretty=0`, `show_in_giyimage_library=true` (ejaan literal), `suppress_http_code=1`, `fb_api_caller_class=RelayModern`, `__ad_account_id`.

Creative:

```text
object_story_spec.page_id = Page ID
object_story_spec.link_data:
  message = Primary Text, atau Card Title jika kosong
  link = Destination URL (HTTPS)
  caption = Display URL (diabaikan jika kosong)
  name = Card Title
  description = Card Description
  picture = URL hasil adimages
  multi_share_end_card = true
  multi_share_optimized = true
```

Perbedaan disengaja dari FewFeed: tanpa aktivasi/watermark, tanpa opsi CTA, tanpa query khusus `fewfeedcors`/`__cppo`, tanpa token di URL/body, tanpa fallback Page feed. Jika upload/create gagal, flow gagal; tidak ada fallback publish. Field story ID pada response POST tidak dipakai; GET pertama selalu langsung setelah creative.id.

Polling maksimum 15 GET dan **14 jeda** 4000 ms; tidak ada jeda setelah attempt terakhir. Pada sukses return `{creativeId, effectiveObjectStoryId, attempt}` dan tidak ada request lanjutan. Payload normal perlu diuji live setelah auth terselesaikan; static research dan mock tidak membuktikan materialisasi story oleh Meta.

## Permissions dan safety guard

- Host permission hanya `https://graph.facebook.com/*`; diperlukan untuk transport Graph yang disiapkan.
- Content-script match hanya HTTP localhost pada path spike; Chrome match pattern tidak membatasi port, sehingga content **dan** worker memeriksa origin persis `http://localhost:3000`.
- Top-frame saja; worker memeriksa ID extension, frame 0, tab ID, sender origin dan path.
- Tidak ada `cookies`, `storage`, `scripting`, `activeTab`, `tabs`, `<all_urls>`, `externally_connectable`, atau web-accessible resources. `tabs.sendMessage` sendiri tidak memerlukan permission untuk membaca metadata tab.
- Tiga operasi memakai ID numerik; tidak ada parameter arbitrary endpoint/method/headers. Input tambahan ditolak.
- Tidak ada implementasi publish, schedule, GraphQL, campaign, adset, atau Ad creation. Tidak ada penghapusan asset otomatis.
- POST tidak di-retry otomatis. Polling hanya untuk GET yang berhasil tetapi belum memiliki story ID; error Meta menghentikan flow.
- Jika worker/halaman terputus, tidak ada resume/replay otomatis. UI timeout tetap mengunci run karena status completion tidak pasti.
- Trust boundary adalah origin development: script lain pada origin yang sama dapat mengirim message. Jangan menganggap postMessage sebagai autentikasi terhadap script same-origin.

Jika kelak transport diaktifkan, upload image dan creative merupakan asset yang dapat tetap berada di Ad Account. Spike tidak memanggil endpoint untuk mempublish atau menghapusnya; status backing story di Meta tidak bisa disimpulkan hanya dari mock.

## Install dan test manual

1. Jalankan `npm.cmd run dev -- --hostname localhost --port 3000` (atau `npm run dev -- --hostname localhost --port 3000` di shell lain).
2. Di Chrome buka `chrome://extensions`, aktifkan Developer mode, pilih **Load unpacked**, pilih folder `extension/` repo ini. Jangan pilih folder reference.
3. Buka `http://localhost:3000/dev/one-card-spike`. Reload halaman setelah install/reload extension.
4. Pastikan **Extension detected**. Jika tidak, pastikan hostname localhost, port 3000, path persis, dan extension aktif. Tidak perlu login Facebook.
5. Isi ID numerik, teks, URL tujuan HTTPS, judul, dan pilih file PNG/JPEG. Klik **TEST ONE CARD**.
6. **Hasil yang benar pada build ini:** Uploading image -> FAILED / AUTH_BLOCKED; tidak ada request Graph dan tidak ada Creative ID nyata. Status Uploading menandai masuk tahap tersebut, bukan bukti network telah berjalan.
7. Halaman pada build production menghasilkan not-found. Origin/port/path lain tidak dapat menjalankan bridge.

Setelah metode auth dibuktikan dan diimplementasikan melalui review terpisah, barulah manual live dapat membuktikan urutan lengkap. UI hasil sudah tersedia untuk Creative ID, Story ID, attempt, dan pesan: **"Spike stops here. Nothing was published by this test."** Jangan menafsirkan keberhasilan mock sebagai keberhasilan live.

## Validasi

```text
node --test extension/core.test.mjs extension/bridge.test.mjs
npx.cmd eslint extension app/dev/one-card-spike
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

Pengujian offline mencakup allowlist, penolakan URL/input ekstra, mapping payload, maksimal 15 GET/14 jeda, interval 4000 ms, stop pada sukses attempt pertama/berikutnya, upload failure tanpa fallback, sanitasi error, header credential sintetis yang tidak masuk URL/website, auth blocker tanpa fetch, pembatasan bridge, serta batas image 5 MiB.

Hasil: **14 test lulus**, scoped ESLint lulus, TypeScript `--noEmit` lulus, production build lulus. Smoke test HTTP lokal pada development menghasilkan 200 dengan form dan auth blocker; HTML production berisi not-found tanpa form spike.

Lint ditargetkan pada file implementasi baru, bukan source reference obfuscated dan artefak riset. Build pertama gagal mengunduh Google Fonts bawaan layout; retry dengan akses jaringan berhasil. Tidak ada perubahan layout/font untuk menyiasati build.

Belum diuji di Chrome atau akun Meta nyata. **Penyebab `effective_object_story_id` tidak tersedia pada standalone test belum terbukti; spike live masih terhalang auth.**
