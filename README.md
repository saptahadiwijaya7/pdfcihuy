# PDF Merge & Arrange Web App

Web app statis untuk merge PDF dan gambar, arrange halaman dengan thumbnail, preview besar, checkbox bulk selection, dan export PDF.

## Cara pakai

1. Buka `index.html` di browser modern.
2. Drag & drop file PDF/JPG/JPEG/PNG/WEBP ke area upload, atau klik tombol pilih file.
3. Susun halaman dengan drag thumbnail.
4. Untuk menyisipkan file baru di urutan tertentu, drag file langsung ke area thumbnail. Slot "Sisipkan di sini" akan muncul, lalu drop file pada posisi depan/tengah/belakang yang diinginkan.
5. Isi nama file export pada textbox.
6. Klik salah satu:
   - **Export PDF** — kualitas penuh (halaman PDF asli di-copy apa adanya).
   - **Export Small** — semua halaman di-render jadi JPEG, ukuran lebih kecil (kualitas tetap).
   - **Export Email (≤22MB)** — otomatis. Coba kualitas penuh dulu; kalau sudah ≤22MB langsung jadi. Kalau kegedean, kompres bertahap sampai file di bawah 22MB, jadi selalu dapat kualitas tertinggi yang masih muat untuk lampiran email.

## Catatan Export Email

Target ukuran diatur lewat `EMAIL_TARGET_MB` di `app.js` (default 22). Perlu diingat: Gmail dkk menghitung ukuran **setelah** encode base64 (±+33%), jadi kalau server mail menolak walau file di bawah 22MB, turunkan angka ini (mis. 18).

## Catatan

Aplikasi berjalan di browser dan memakai CDN untuk PDF.js, PDF-Lib, dan SortableJS. Untuk penggunaan offline penuh, library CDN bisa diunduh dan disimpan lokal.
