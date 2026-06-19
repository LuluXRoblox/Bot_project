#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "Menginstall Python (kalau belum ada)..."
pkg install -y python

echo "Menginstall dependency..."
pip install -r requirements.txt

echo ""
echo "✅ Selesai! Jalankan dengan:"
echo "   python main.py"
