# Discord Setup Bot — Vercel Backend

Backend API buat bot Discord yang fungsinya cuma satu: **setup struktur server** (roles + categories + channels) berdasarkan template, lalu selesai. Tidak perlu bot online 24 jam — semua jalan lewat REST API Discord di atas Vercel Serverless Functions.

Token bot **tidak pernah** terlihat oleh user. User hanya invite bot ke server mereka, lalu jalankan script Termux yang ngomong ke API ini.

---

## Alur Singkat

```
1. User invite bot ke server mereka
2. Script Termux minta kode verifikasi → POST /api/request-code
3. Bot DM kode 6 digit ke user
4. User masukkan kode → POST /api/verify-code → dapat session_token
5. Script ambil daftar server milik user → GET /api/servers
   (otomatis sync: cek audit log buat tahu siapa yang invite bot)
6. Script ambil daftar template → GET /api/templates
7. User pilih server + mode + template → POST /api/setup
8. (Opsional) User minta riwayat → GET /api/history
9. (Opsional) Bot leave server → POST /api/leave-guild
```

Setiap endpoint yang butuh otorisasi pakai header:
```
x-session-token: <token dari /api/verify-code>
```

---

## Setup Bot Discord

1. Buat application di https://discord.com/developers/applications
2. Buat Bot, copy **Bot Token** → ini yang masuk env `DISCORD_BOT_TOKEN`
3. **Privileged Gateway Intents tidak perlu diaktifkan** — semua lewat REST, bot tidak pernah connect ke Gateway.
4. Bikin invite link dengan permission minimal: `Manage Roles`, `Manage Channels`, `View Audit Log`:
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=268435600&scope=bot
   ```
   (Cek ulang nilai permission di https://discordapi.com/permissions.html kalau mau nambah/kurangi akses)

---

## Setup Database (MongoDB Atlas)

1. Buat akun & cluster gratis di https://www.mongodb.com/cloud/atlas
2. **Database Access** → buat database user (username + password)
3. **Network Access** → tambah `0.0.0.0/0` (Vercel pakai IP dinamis, jadi perlu allow semua)
4. **Connect** → pilih driver Node.js → copy connection string-nya
5. Masukkan ke env var `MONGODB_URI` di Vercel

Koleksi (`verify_codes`, `sessions`, `guild_owners`, `history`, `last_created`) dan TTL index dibuat otomatis pertama kali API dipanggil — tidak perlu setup manual.

---

## Versi Simple — Slash Command (Direkomendasikan)

Selain alur lewat Termux (di atas), bot ini juga bisa dipakai **langsung lewat slash command di Discord**, tanpa Termux sama sekali. Ini jauh lebih simpel buat user akhir.

```
User invite bot ke server
 ↓
User ketik /setup-server di channel manapun
 ↓
Bot proses (role/category/channel) langsung
 ↓
Bot balas hasil setup di channel itu
```

Discord sendiri yang ngatur siapa boleh pakai command (default: cuma yang punya permission **Administrator**, bisa diubah server admin lewat **Server Settings → Integrations**). Gak perlu DM kode verifikasi atau session token lagi.

### Setup (sekali aja)

1. Di **Discord Developer Portal** → application kamu → **General Information**, catat:
   - **Application ID**
   - **Public Key**
2. Tambah env var di Vercel:
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_APPLICATION_ID`
   - `ADMIN_SECRET` (bikin string acak sendiri, buat lindungi endpoint register command)
3. Deploy/redeploy dulu
4. Daftarkan slash command — buka di browser:
   ```
   https://bot-project-six.vercel.app/api/register-commands?secret=ADMIN_SECRET_KAMU
   ```
   Sukses kalau muncul `{"ok":true,"registered":[...]}`. Command global butuh waktu sampai ±1 jam buat muncul di semua server (biasanya lebih cepat).
5. Balik ke Developer Portal → **General Information** → isi **Interactions Endpoint URL**:
   ```
   https://bot-project-six.vercel.app/api/interactions
   ```
   Discord langsung ngirim PING buat tes endpoint ini — kalau gagal disimpan, berarti ada yang salah (cek Vercel Runtime Logs).

### Command yang tersedia

| Command | Fungsi |
|---|---|
| `/setup-server template:<pilih> mode:<pilih>` | Jalankan setup |
| `/list-template` | Lihat daftar template |
| `/setup-history` | Lihat riwayat setup server ini |
| `/bot-leave` | Bot keluar dari server |

> Kalau nambah template baru (file JSON baru di `templates/`), ulangi langkah 4 (register-commands) biar pilihan template di `/setup-server` ke-update.

---

## Deploy ke Vercel

1. Push folder ini ke GitHub repo
2. Import ke Vercel
3. Tambah env var `DISCORD_BOT_TOKEN` dan `MONGODB_URI`
4. Deploy

---

## Struktur Folder

```
api/
  request-code.js     → kirim kode verifikasi via DM (versi Termux)
  verify-code.js       → cek kode, buat session (versi Termux)
  servers.js           → sync + list server milik user (versi Termux)
  templates.js         → list template tersedia (versi Termux)
  setup.js             → jalankan setup, dipanggil dari Termux
  history.js           → riwayat setup per server (versi Termux)
  leave-guild.js        → bot keluar dari server (versi Termux)
  interactions.js       → endpoint slash command (versi Simple)
  register-commands.js  → daftarin slash command ke Discord (sekali jalan)
lib/
  discord.js           → wrapper Discord REST API
  discord-verify.js     → verifikasi signature request Discord
  db.js                 → wrapper MongoDB Atlas
  setup-engine.js        → logic 3 mode: recreate / overwrite / tidy
templates/
  *.json                 → definisi role & channel per template
```

---

## Tambah Template Baru

Tinggal bikin file baru di `templates/nama_template.json` dengan format:

```json
{
  "key": "nama_template",
  "name": "Nama Tampilan",
  "roles": [
    { "name": "Owner", "color": 15548997, "hoist": true, "permissions": "8" }
  ],
  "categories": [
    {
      "name": "📌 INFORMATION",
      "channels": [
        { "name": "welcome", "type": "text" }
      ]
    }
  ]
}
```

`type` channel: `"text"` atau `"voice"`. Otomatis muncul di `/api/templates` tanpa perlu ubah kode lain.

---

## Mode Setup

| Mode | Perilaku |
|---|---|
| `recreate` (Buat Ulang) | Hapus role/category/channel hasil setup sebelumnya, lalu bikin dari nol |
| `overwrite` (Timpa) | Cek yang sudah ada, cuma nambahin yang kurang |
| `tidy` (Rapikan) | Rename, urutkan ulang, hapus channel teks kosong yang tidak ada di template |

---

## Catatan Keamanan

- Kepemilikan server (`guild_owner`) ditentukan otomatis dari **Audit Log** Discord (siapa yang invite bot), tidak bisa dipalsukan dengan asal input User ID.
- Kode verifikasi DM memastikan orang yang menjalankan Termux benar-benar punya akses ke akun Discord tersebut.
- `setup.js` selalu cross-check `guild_owner` sebelum eksekusi — User A tidak bisa setup server User B.
