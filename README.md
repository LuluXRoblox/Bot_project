# Bot_project

Repo ini isinya 2 bagian, sengaja digabung jadi 1 repo biar gampang di-maintain:

```
Bot_project/
├── backend/         → API yang dideploy ke Vercel (Node.js, MongoDB Atlas)
└── termux-client/   → Script CLI buat Termux (Python)
```

---

## Deploy Backend ke Vercel

1. Import repo ini ke Vercel
2. **PENTING**: di Project Settings → General → **Root Directory**, set ke `backend`
   (biar Vercel cuma build folder backend, bukan keseluruhan repo)
3. Tambah env var `DISCORD_BOT_TOKEN` dan `MONGODB_URI`
4. Deploy

Detail lengkap ada di `backend/README.md`.

---

## Pakai di Termux

```bash
pkg install python git -y
git clone https://github.com/USERNAME/Bot_project.git
cd Bot_project/termux-client
bash install.sh
python main.py
```

Detail lengkap ada di `termux-client/README.md`.

---

## Alur Pakai (User Akhir)

```
User invite bot ke server Discord mereka
 ↓
Jalankan python main.py di Termux
 ↓
Masukkan Discord User ID
 ↓
Bot kirim kode 6 digit lewat DM
 ↓
Masukkan kode itu
 ↓
Masuk Menu Utama → pilih server → pilih template → setup jalan
```
