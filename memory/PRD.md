# PRD — Catatan Keuangan Asatidz

## Visi
Aplikasi mobile pribadi (Expo/React Native) untuk para asatidz/asatidzah (ustadz dan ustadzah) pondok pesantren agar bisa mencatat pemasukan & pengeluaran harian dengan sederhana, dalam Bahasa Indonesia, dan format Rupiah.

## Stack
- Frontend: Expo SDK 54, expo-router, react-native-svg (chart), expo-audio, expo-file-system, expo-sharing
- Backend: FastAPI + MongoDB (Motor), httpx, openpyxl (Excel), reportlab (PDF)
- Auth: Emergent Google OAuth (Bearer session token disimpan di expo-secure-store)
- AI: OpenAI Whisper-1 (STT id-ID) + OpenAI GPT-4o untuk ekstraksi transaksi dari kalimat, via Emergent LLM Key

## Alur User
1. Welcome → Masuk dengan Google
2. Pilih gelar (Ustadz / Ustadzah) + konfirmasi nama (hanya saat pertama kali)
3. Dashboard menampilkan sapaan "Assalamu'alaikum, Ustadz/Ustadzah <Nama>"

## Fitur
### Dashboard (Beranda)
- Sapaan dinamis sesuai gelar
- Reminder banner kalau belum mencatat hari ini
- Balance card bulan berjalan (saldo, pemasukan, pengeluaran)
- Quick action: Tambah Pemasukan / Pengeluaran
- Tombol "Catat dengan Suara" → AI voice-to-transaction
- Donut chart pengeluaran per kategori bulan ini
- 6 transaksi terakhir

### Riwayat (Tab History)
- Filter chip horizontal: semua/pemasukan/pengeluaran, bulan, tahun
- Search bar (catatan/kategori)
- Tap transaksi untuk edit/hapus

### Laporan (Tab Reports)
- Default rentang 6 bulan terakhir
- Stat cards: total pemasukan, pengeluaran, saldo
- Kategori pengeluaran terbesar
- Bar chart pemasukan vs pengeluaran per bulan
- Donut chart proporsi pengeluaran
- Export PDF & Excel (download/share)

### Profil (Tab Profile)
- Info user
- Setting jam pengingat (0–23)
- Logout

### Transaksi (Modal)
- Jenis (toggle), jumlah (input Rupiah), kategori (chip horizontal), tanggal (YYYY-MM-DD), catatan, **voice note** (rekam max 30 detik, base64 disimpan)
- Edit & hapus untuk transaksi existing

### Voice / AI Catat Suara
- Tombol mic besar, rekam max 30 detik
- Backend Whisper transkripsi (language=id) → GPT-4o ekstrak: type/amount/category/note
- User review draft → konfirmasi → lanjut ke form transaksi (sudah terisi) + audio terlampir

## Data Model (Mongo)
- `users`: user_id, email, name, picture, gelar, reminder_hour, created_at, last_login_at
- `user_sessions`: session_token, user_id, expires_at (TTL 7 hari)
- `categories`: id, user_id, name, type, icon, is_default
- `transactions`: id, user_id, type, amount, category, date (YYYY-MM-DD), note, voice_note_base64, voice_note_mime, created_at

## Endpoint Backend (semua prefix `/api`)
Auth: /auth/session, /auth/session-token, /auth/me, /auth/logout, /auth/gelar, /auth/reminder
Kategori: GET/POST /categories, DELETE /categories/{id}
Transaksi: GET/POST /transactions, GET/PUT/DELETE /transactions/{id}
Laporan: GET /reports/summary, /reports/range, /reports/export/excel, /reports/export/pdf
Reminder: GET /reminder/status
Voice: POST /voice/parse

## Hasil Testing
Backend (testing agent, iteration_1.json): **25/25 PASSED (100%)** — auth, isolasi data antar-user, CRUD, filter, laporan, export PDF/Excel, reminder, voice validasi input.

## Next ideas (bisa dilanjut sesuai permintaan user)
- Backup/export semua data ke cloud user
- Statistik perbandingan dengan rata-rata bulan sebelumnya
- Custom kategori dengan ikon emoji/library lebih luas
- Tema gelap
