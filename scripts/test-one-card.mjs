const GRAPH_VERSION = "v25.0";

// ======================================================
// KONFIGURASI TEST
// ======================================================

// TOKEN TEST SAJA.
// Jangan gunakan token produksi yang dipakai aplikasi perusahaan.
const ACCESS_TOKEN = "EAAXhNG2F7d4BSdssdRqcNYk6sN3EO1JP2IGYz1222EZAlLplwjqskUqe9vZBvRh5FbLZBs8UDPs0nkYorZAQako7UvkjbBWz5Rqcfoax77UpAKhV0qwZBVQIdREiN0BBrbGaEOAj81muSEZBvmeZBe5FXP6RZCZCZBAajfib7jc2IpnoVZATU3mhYcHkRiAVTl5W5dxsbZAAWqzJn4tg7vGB4fEqPZBTmzE308WFQQz77ZAtGnZCPHMZAra6pRWY9onRmWX0O07awwc7oWErgMoZCZA07ZBeF2WbAgZC";

// Ad Account yang sebelumnya sudah terbukti dapat diakses.
const AD_ACCOUNT_ID = "2356191958234554";

// Fanpage test yang sebelumnya berhasil dibaca.
const PAGE_ID = "115346314952116";

// Gambar publik untuk test.
const IMAGE_URL =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200";

// Link aman untuk test.
const DESTINATION_URL = "https://example.com";
const DISPLAY_URL = "example.com";

const PRIMARY_TEXT = "Test One Card API";
const CARD_TITLE = " ";
const CARD_DESCRIPTION = " ";

// Safety guard.
// Script tidak akan berjalan sampai nilai ini true.
const SAFETY_CONFIRM = true;


// ======================================================
// SAFETY CHECK
// ======================================================

function safetyCheck() {
  console.log("\n================================");
  console.log("SAFETY CHECK");
  console.log("================================");

  console.log("Ad Account :", AD_ACCOUNT_ID);
  console.log("Page ID    :", PAGE_ID);

  console.log("\nScript ini HANYA akan:");
  console.log("1. Download gambar test");
  console.log("2. Upload gambar ke Ad Account");
  console.log("3. Membuat Ad Creative");
  console.log("4. Membaca detail Ad Creative");

  console.log("\nScript ini TIDAK akan:");
  console.log("- membuat Campaign");
  console.log("- membuat Ad Set");
  console.log("- membuat Ad");
  console.log("- menjalankan iklan");
  console.log("- publish ke feed Fanpage");
  console.log("- schedule post");
  console.log("- menghapus post");
  console.log("- mengubah setting Fanpage");

  if (!SAFETY_CONFIRM) {
    throw new Error(
      "SAFETY_CONFIRM belum true. Script dihentikan."
    );
  }

  if (!ACCESS_TOKEN) {
    throw new Error(
      "ACCESS_TOKEN masih kosong."
    );
  }
}


// ======================================================
// GRAPH REQUEST
// ======================================================

async function graphRequest(path, options = {}) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;

  const response = await fetch(url, options);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Response bukan JSON:\n${text}`
    );
  }

  if (!response.ok || data.error) {
    console.error("\nMETA API ERROR:");
    console.error(
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      "Meta API request gagal."
    );
  }

  return data;
}


// ======================================================
// 1. DOWNLOAD GAMBAR TEST
// ======================================================

async function downloadTestImage() {
  console.log(
    "\n1. Download gambar test..."
  );

  const response =
    await fetch(IMAGE_URL);

  if (!response.ok) {
    throw new Error(
      `Download gambar gagal. HTTP ${response.status}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const contentType =
    response.headers.get("content-type") ||
    "image/jpeg";

  console.log(
    "Gambar berhasil didownload."
  );

  console.log(
    "Ukuran:",
    arrayBuffer.byteLength,
    "bytes"
  );

  console.log(
    "Content-Type:",
    contentType
  );

  return {
    arrayBuffer,
    contentType,
  };
}


// ======================================================
// 2. UPLOAD KE ADIMAGES
// ======================================================

async function uploadAdImage(
  arrayBuffer,
  contentType
) {
  console.log(
    "\n2. Upload gambar ke Ad Account /adimages..."
  );

  const form = new FormData();

  form.append(
    "access_token",
    ACCESS_TOKEN
  );

  const blob = new Blob(
    [arrayBuffer],
    {
      type: contentType,
    }
  );

  form.append(
    "filename",
    blob,
    "one-card-test.jpg"
  );

  const result =
    await graphRequest(
      `act_${AD_ACCOUNT_ID}/adimages`,
      {
        method: "POST",
        body: form,
      }
    );


  console.log(
    "\nHASIL ADIMAGES:"
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  if (
    !result.images ||
    typeof result.images !== "object"
  ) {
    throw new Error(
      "Meta tidak mengembalikan object images."
    );
  }


  const imageEntries =
    Object.values(result.images);


  if (imageEntries.length === 0) {
    throw new Error(
      "Tidak ada image result dari Meta."
    );
  }


  const image =
    imageEntries[0];


  if (!image.hash) {
    throw new Error(
      "Image berhasil diupload tetapi hash tidak ditemukan."
    );
  }


  console.log(
    "\nIMAGE HASH:",
    image.hash
  );


  return image.hash;
}


// ======================================================
// 3. CREATE AD CREATIVE DENGAN IMAGE HASH
// ======================================================

async function createCreative(
  imageHash
) {
  console.log(
    "\n3. Membuat Ad Creative menggunakan image_hash..."
  );


  const objectStorySpec = {
    page_id: PAGE_ID,

    link_data: {
      message:
        PRIMARY_TEXT,

      link:
        DESTINATION_URL,

      caption:
        DISPLAY_URL,

      image_hash:
        imageHash,

      name:
        CARD_TITLE,

      description:
        CARD_DESCRIPTION,

      multi_share_end_card:
        false,

      multi_share_optimized:
        true,
    },
  };


  console.log(
    "\nOBJECT STORY SPEC YANG DIKIRIM:"
  );

  console.log(
    JSON.stringify(
      objectStorySpec,
      null,
      2
    )
  );


  const body =
    new URLSearchParams();

  body.set(
    "access_token",
    ACCESS_TOKEN
  );

  body.set(
    "name",
    `ONE CARD HASH TEST ${Date.now()}`
  );

  body.set(
    "object_story_spec",
    JSON.stringify(
      objectStorySpec
    )
  );


  const result =
    await graphRequest(
      `act_${AD_ACCOUNT_ID}/adcreatives`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );


  if (!result.id) {
    throw new Error(
      "Creative dibuat tetapi Meta tidak mengembalikan ID."
    );
  }


  console.log(
    "\nCreative berhasil dibuat."
  );

  console.log(
    "Creative ID:",
    result.id
  );


  return result.id;
}


// ======================================================
// 4. CEK DETAIL CREATIVE
// ======================================================

async function inspectCreative(
  creativeId
) {
  console.log(
    "\n4. Mengecek detail Creative..."
  );


  const params =
    new URLSearchParams({
      access_token:
        ACCESS_TOKEN,

      fields: [
        "id",
        "name",
        "object_story_id",
        "effective_object_story_id",
        "object_story_spec",
      ].join(","),
    });


  const result =
    await graphRequest(
      `${creativeId}?${params.toString()}`
    );


  console.log(
    "\n================================"
  );

  console.log(
    "HASIL DETAIL CREATIVE"
  );

  console.log(
    "================================"
  );


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ======================================================
// MAIN
// ======================================================

async function main() {
  try {

    safetyCheck();


    // --------------------------------
    // STEP 1
    // --------------------------------

    const {
      arrayBuffer,
      contentType,
    } =
      await downloadTestImage();


    // --------------------------------
    // STEP 2
    // --------------------------------

    const imageHash =
      await uploadAdImage(
        arrayBuffer,
        contentType
      );


    // --------------------------------
    // STEP 3
    // --------------------------------

    const creativeId =
      await createCreative(
        imageHash
      );


    // --------------------------------
    // STEP 4
    // --------------------------------

    const creative =
      await inspectCreative(
        creativeId
      );


    // --------------------------------
    // KESIMPULAN
    // --------------------------------

    console.log(
      "\n================================"
    );

    console.log(
      "KESIMPULAN TEST"
    );

    console.log(
      "================================"
    );


    console.log(
      "Image Hash :",
      imageHash
    );


    console.log(
      "Creative ID :",
      creativeId
    );


    console.log(
      "Object Story ID :",
      creative.object_story_id ??
        "TIDAK ADA"
    );


    console.log(
      "Effective Story ID :",
      creative.effective_object_story_id ??
        "TIDAK ADA"
    );


    if (
      creative.effective_object_story_id
    ) {

      console.log(
        "\n>>> EFFECTIVE OBJECT STORY ID DITEMUKAN <<<"
      );

    } else {

      console.log(
        "\nEffective Object Story ID masih belum tersedia."
      );
    }


    console.log(
      "\n================================"
    );

    console.log(
      "SCRIPT DIHENTIKAN DI SINI."
    );

    console.log(
      "TIDAK ADA PUBLISH."
    );

    console.log(
      "TIDAK ADA SCHEDULE."
    );

    console.log(
      "TIDAK ADA CAMPAIGN / AD SET / AD."
    );

    console.log(
      "================================"
    );


  } catch (error) {

    console.error(
      "\nTEST GAGAL:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  }
}


main();