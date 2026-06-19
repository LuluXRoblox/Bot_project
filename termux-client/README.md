# Discord Setup Bot — Termux Client

Script CLI buat Termux yang ngomong ke backend Vercel. Sekali jalan, pilih server → pilih template → done. Token bot **tidak ada di sini sama sekali**.

---

## Sebelum Push ke GitHub

Edit `constants.py`, isi `API_BASE_URL` dengan alamat hasil deploy Vercel kamu:

```python
API_BASE_URL = "https://nama-project-kamu.vercel.app/api"
```

URL ini **tertanam di kode**, bukan diminta lewat input — user yang pakai script ini tidak perlu (dan tidak bisa) mengubahnya.

---

## Install di Termux

```bash
termux-setup-storage
pkg update
pkg install python git -y

git clone <url-repo-kamu>
cd termux-client
bash install.sh
```

---

## Jalankan

```bash
python main.py
```

Pertama kali jalan, kamu akan diminta:
1. **Discord User ID** — bot akan DM kode verifikasi 6 digit
2. **Kode verifikasi** — masukkan kode dari DM

Setelah login, session disimpan lokal di `~/.discord_setup_bot/config.json` (otomatis dipakai lagi di run berikutnya selama belum expired/logout).

---

## Update Kode Nanti

```bash
cd termux-client
git pull
```

---

## Catatan

- Kalau gagal "request code", pastikan kamu sudah **invite bot ke server** dan **DM Server Members kamu terbuka** untuk member server itu.
- Server yang muncul di "Pilih Server" hanya yang bot-nya sudah join **dan** kamu yang invite (dicek otomatis lewat audit log).
- Session expired setelah 1 jam — tinggal login ulang, kode DM baru akan dikirim lagi.
