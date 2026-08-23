# Konfigurasi Firebase Realtime Database (Chat Realtime)

Backend BI-Space memakai **Google Apps Script**, yang **tidak bisa** menjadi WebSocket server.  
Firebase Realtime Database dipakai sebagai saluran **push tick** (sinyal pesan baru). Isi pesan tetap di Google Sheet lewat API yang sudah ada.

Alur:
1. User A mengirim pesan → GAS simpan ke Sheet → GAS tulis tick ke RTDB
2. User B (tab chat terbuka) **mendengar** tick lewat Firebase SDK → langsung `refreshMessages`

---

## A. Firebase Console

1. Buka [Firebase Console](https://console.firebase.google.com/) → pilih **project yang sama** dengan FCM / `google-services.json` app BI-Space.
2. **Build → Realtime Database → Create Database**
   - Lokasi disarankan: `asia-southeast1` (Singapore) atau yang terdekat.
   - Mode awal: **Start in locked mode** (nanti rules diset manual).
3. Salin **Database URL**, contoh:
   - `https://nama-project-default-rtdb.asia-southeast1.firebasedatabase.app`
4. **Project settings** (ikon gear) → **General** → Your apps → Web app (`</>`)
   - Jika belum ada Web app: **Add app → Web**
   - Salin nilai config:
     - `apiKey`
     - `authDomain`
     - `projectId`
     - `databaseURL` (sama dengan langkah 3)

### Rules (Realtime Database → Rules)

Tempel lalu **Publish**:

```json
{
  "rules": {
    "chatTicks": {
      ".read": true,
      ".write": false
    }
  }
}
```

- Client hanya **baca** tick (sequence + messageId), **bukan** isi chat.
- Tulis hanya dari Apps Script (service account + access token).

### Service account (sudah dipakai FCM)

Pastikan service account di Script Properties punya akses ke project Firebase yang sama:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

Di Google Cloud Console → IAM, service account tersebut idealnya punya role terkait Firebase / Editor project (minimal bisa akses Realtime Database).

---

## B. Apps Script — Script properties

**Project Settings → Script properties** tambahkan:

| Property | Contoh nilai |
|----------|----------------|
| `FIREBASE_DATABASE_URL` | `https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `FIREBASE_API_KEY` | `AIza...` (dari web config) |
| `FIREBASE_AUTH_DOMAIN` | `xxx.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `xxx` (boleh sama dengan `FCM_PROJECT_ID`) |

`FCM_*` tetap dipakai untuk OAuth menulis ke RTDB.

---

## C. Apps Script — kode

1. Buat file script baru, tempel isi [`gas/FirebaseRtdb.gs`](../gas/FirebaseRtdb.gs) dari repo.
2. Di `apiActions_()` (Code.gs) tambahkan:

```javascript
getFirebasePublicConfig: getFirebasePublicConfig,
```

3. Hook publish setelah pesan tersimpan.

**Di `sendChatMessage`** (setelah `appendChatMessage_` / sebelum return):

```javascript
try { publishChatRealtimeTick_(roomId, message); } catch (e) {}
```

**Di `notifyChatRoom_`** (opsional, untuk task):

```javascript
try { publishChatRealtimeTick_(roomId, { id: entityId, sequence: 0 }); } catch (e) {}
```

4. **Deploy** → Manage deployments → Edit → **New version** → Deploy.

---

## D. Frontend

`docs/chat.html` sudah dilengkapi listener Firebase (jika config tersedia).  
Hard refresh chat setelah deploy.

Jika RTDB belum dikonfigurasi, chat **otomatis fallback** ke poll 1,5 detik (tetap jalan).

---

## E. Uji

1. Buka chat di dua browser/device (room sama).
2. Kirim pesan dari A.
3. B harus muncul **tanpa menunggu lama** (biasanya < 1 detik setelah tick).
4. Apps Script → Executions / Logs: tidak ada `RTDB tick gagal` / `RTDB OAuth gagal`.
5. Firebase Console → Realtime Database → Data → `chatTicks` → ada node room.

---

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Tidak ada node di `chatTicks` | `FIREBASE_DATABASE_URL`, private key, deploy GAS baru |
| OAuth gagal | `FCM_PRIVATE_KEY` format `\\n`, client email benar |
| Client tidak listen | `FIREBASE_API_KEY` + rules `.read: true` pada `chatTicks` |
| Permission denied di browser | Rules belum di-Publish |
| Tetap lambat | Hard refresh; console: `[BI-Chat] RTDB listening` |

---

## Keamanan

- Jangan taruh `FCM_PRIVATE_KEY` di frontend / repo publik.
- Rules: client **tidak** boleh write.
- Tick hanya metadata; isi pesan tetap lewat API terautentikasi session.
