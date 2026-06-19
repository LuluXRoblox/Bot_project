import os
import sys
import time

from storage import load_config, save_config, clear_session
from api import ApiClient, ApiError
from constants import API_BASE_URL

MODES = [
    ("recreate", "Buat Ulang", "Hapus setup lama lalu bikin dari nol"),
    ("overwrite", "Timpa", "Tambahkan yang kurang, tidak hapus apapun"),
    ("tidy", "Rapikan", "Rename/urutkan ulang & bersihkan channel kosong"),
]


def clear_screen():
    os.system("clear" if os.name == "posix" else "cls")


def header(title):
    clear_screen()
    print("=" * 40)
    print(title)
    print("=" * 40)


def pause():
    input("\nTekan ENTER untuk lanjut...")


def ask(prompt):
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print("\nDibatalkan.")
        sys.exit(0)


def choose_from_list(items, label_fn, title="Pilih:"):
    """items: list apapun, label_fn(item) -> string buat ditampilkan"""
    print(title)
    for i, item in enumerate(items):
        print(f"{i}. {label_fn(item)}")
    while True:
        choice = ask("\n> ")
        if choice.isdigit() and 0 <= int(choice) < len(items):
            return items[int(choice)]
        print("Pilihan tidak valid, coba lagi.")


# ============================================================
# LOGIN
# ============================================================


def login(cfg):
    """Pastikan ada session_token yang valid. Kalau belum, jalankan flow verifikasi DM."""
    if cfg.get("session_token"):
        return cfg

    header("LOGIN")
    client = ApiClient(API_BASE_URL)

    user_id = ask("Masukkan Discord User ID kamu: ")
    print("\nMengirim kode verifikasi lewat DM...")
    try:
        client.request_code(user_id)
    except ApiError as e:
        print(f"\n❌ Gagal: {e}")
        pause()
        sys.exit(1)

    print("✅ Kode terkirim. Cek DM Discord kamu.\n")
    code = ask("Masukkan kode 6 digit: ")

    try:
        result = client.verify_code(user_id, code)
    except ApiError as e:
        print(f"\n❌ Verifikasi gagal: {e}")
        pause()
        sys.exit(1)

    cfg["session_token"] = result["session_token"]
    cfg["user_id"] = user_id
    save_config(cfg)
    print("\n✅ Login berhasil!")
    pause()
    return cfg


# ============================================================
# MENU UTAMA
# ============================================================

def menu_utama(cfg):
    while True:
        header("MENU UTAMA")
        print("1. Pilih Server")
        print("2. Riwayat Setup")
        print("3. Template Manager")
        print("4. Setting Bot")
        print("5. Exit")
        choice = ask("\n> ")

        if choice == "1":
            flow_pilih_server(cfg)
        elif choice == "2":
            flow_riwayat(cfg)
        elif choice == "3":
            flow_template_manager(cfg)
        elif choice == "4":
            flow_setting(cfg)
        elif choice == "5":
            print("Sampai jumpa!")
            sys.exit(0)
        else:
            print("Pilihan tidak ada.")
            pause()


# ============================================================
# 1. PILIH SERVER -> CHANNEL MODE -> TEMPLATE -> ENGINE -> REPORT
# ============================================================

def flow_pilih_server(cfg):
    client = ApiClient(API_BASE_URL, cfg["session_token"])

    header("PILIH SERVER")
    print("Mengambil daftar server...\n")
    try:
        data = client.get_servers()
    except ApiError as e:
        print(f"❌ Gagal ambil server: {e}")
        pause()
        return

    guilds = data.get("guilds", [])
    if not guilds:
        print("Belum ada server. Invite bot dulu ke server kamu, lalu coba lagi.")
        pause()
        return

    header("PILIH SERVER")
    guild = choose_from_list(guilds, lambda g: g["name"])

    mode = flow_channel_mode()
    if mode is None:
        return

    template = flow_pilih_template(client)
    if template is None:
        return

    flow_jalankan_setup(cfg, client, guild, template, mode)


def flow_channel_mode():
    header("CHANNEL MODE")
    print("Pilih cara setup:\n")
    for i, (_, name, desc) in enumerate(MODES):
        print(f"{i}. {name}")
        print(f"   {desc}\n")
    choice = ask("> ")
    if choice.isdigit() and 0 <= int(choice) < len(MODES):
        return MODES[int(choice)][0]
    print("Pilihan tidak valid.")
    pause()
    return None


def flow_pilih_template(client):
    header("PILIH TEMPLATE")
    print("Mengambil daftar template...\n")
    try:
        data = client.get_templates()
    except ApiError as e:
        print(f"❌ Gagal ambil template: {e}")
        pause()
        return None

    templates = data.get("templates", [])
    if not templates:
        print("Tidak ada template tersedia.")
        pause()
        return None

    header("PILIH TEMPLATE")
    return choose_from_list(templates, lambda t: t["name"])


def flow_jalankan_setup(cfg, client, guild, template, mode):
    header("PROSES SETUP")
    mode_name = next(m[1] for m in MODES if m[0] == mode)
    print(f"Server   : {guild['name']}")
    print(f"Template : {template['name']}")
    print(f"Mode     : {mode_name}\n")
    confirm = ask("Lanjutkan setup? (y/n): ")
    if confirm.lower() != "y":
        print("Dibatalkan.")
        pause()
        return

    print("\nMenjalankan setup di server... (bisa sampai ~1 menit, jangan tutup dulu)")
    start = time.time()
    try:
        result = client.run_setup(guild["id"], template["key"], mode)
    except ApiError as e:
        print(f"\n❌ Setup gagal: {e}")
        pause()
        return

    elapsed = time.time() - start
    flow_report(guild, template, result, elapsed)
    flow_after_setup(cfg, client, guild)


def flow_report(guild, template, result, elapsed):
    header("SETUP SUCCESS")
    print(f"Server   : {guild['name']}")
    print(f"Template : {template['name']}\n")
    print("Created:")
    if "rolesCreated" in result:
        print(f"✅ Roles      : {result.get('rolesCreated', 0)}/{result.get('rolesTotal', '-')}")
        print(f"✅ Categories : {result.get('categoriesCreated', 0)}/{result.get('categoriesTotal', '-')}")
        print(f"✅ Channels   : {result.get('channelsCreated', 0)}/{result.get('channelsTotal', '-')}")
    else:
        # hasil mode "tidy" beda bentuk
        print(f"✅ Renamed    : {result.get('renamed', 0)}")
        print(f"✅ Moved      : {result.get('moved', 0)}")
        print(f"✅ Reordered  : {result.get('reordered', 0)}")
        print(f"✅ Cleaned    : {result.get('cleaned', 0)}")
    print(f"\nWaktu: {elapsed:.1f}s")
    pause()


def flow_after_setup(cfg, client, guild):
    header("AFTER SETUP")
    choice = ask(f"Bot keluar dari '{guild['name']}' sekarang? (y/n): ")
    if choice.lower() == "y":
        try:
            client.leave_guild(guild["id"])
            print("✅ Bot keluar dari server.")
        except ApiError as e:
            print(f"❌ Gagal leave server: {e}")
    else:
        print("Bot tetap di server.")
    pause()


# ============================================================
# 2. RIWAYAT SETUP
# ============================================================

def flow_riwayat(cfg):
    client = ApiClient(API_BASE_URL, cfg["session_token"])

    header("RIWAYAT SETUP")
    try:
        data = client.get_servers()
    except ApiError as e:
        print(f"❌ Gagal ambil server: {e}")
        pause()
        return

    guilds = data.get("guilds", [])
    if not guilds:
        print("Belum ada server.")
        pause()
        return

    guild = choose_from_list(guilds, lambda g: g["name"], title="Pilih server buat lihat riwayat:")

    try:
        hist_data = client.get_history(guild["id"])
    except ApiError as e:
        print(f"❌ Gagal ambil riwayat: {e}")
        pause()
        return

    header(f"RIWAYAT - {guild['name']}")
    history = hist_data.get("history", [])
    if not history:
        print("Belum ada riwayat setup untuk server ini.")
    else:
        for h in history:
            status_icon = "✅" if h.get("status") == "success" else "❌"
            print(f"{status_icon} {h.get('date', '-')}  |  {h.get('template', '-')}  |  mode: {h.get('mode', '-')}")
    pause()


# ============================================================
# 3. TEMPLATE MANAGER (lihat daftar template yang tersedia di server)
# ============================================================

def flow_template_manager(cfg):
    client = ApiClient(API_BASE_URL, cfg["session_token"])
    header("TEMPLATE MANAGER")
    try:
        data = client.get_templates()
    except ApiError as e:
        print(f"❌ Gagal ambil template: {e}")
        pause()
        return

    templates = data.get("templates", [])
    print("Template tersedia:\n")
    for t in templates:
        print(f"- {t['name']}  (key: {t['key']})")
    print("\nUntuk menambah template baru, edit folder templates/ di project Vercel kamu.")
    pause()


# ============================================================
# 4. SETTING BOT
# ============================================================

def flow_setting(cfg):
    while True:
        header("SETTING BOT")
        print(f"API Base URL : {API_BASE_URL}")
        print(f"User ID      : {cfg.get('user_id') or '(belum login)'}\n")
        print("1. Logout")
        print("2. Kembali")
        choice = ask("\n> ")

        if choice == "1":
            clear_session(cfg)
            print("✅ Logout. Login ulang dibutuhkan.")
            pause()
            login(cfg)
        elif choice == "2":
            return
        else:
            print("Pilihan tidak ada.")
            pause()


# ============================================================
# ENTRY POINT
# ============================================================

def main():
    cfg = load_config()
    cfg = login(cfg)
    menu_utama(cfg)


if __name__ == "__main__":
    main()
