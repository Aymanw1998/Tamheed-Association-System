# העלאת תמהיד לשרת פרטי (VPS)

המדריך מניח:

- שרת **Ubuntu 22.04 או 24.04**;
- דומיין שמצביע לכתובת ה-IP של השרת (רשומת `A`);
- בסיס הנתונים ב-**MongoDB Atlas**.

את כל הפקודות מריצים בשרת, אלא אם כתוב אחרת.

> אל תשמור סיסמאות, מפתחות או מספרי זהות אמיתיים בקבצים שבתיקייה הזו. ה-repo פומבי.
> הסודות נמצאים רק ב-`server/config/.env` בשרת.

---

## לפני שמתחילים (על המחשב שלך)

1. **גיבוי ב-Atlas:** Atlas ← Cluster ← Backup ← "Take Snapshot Now".
2. **העברת ההרשאות** (פעם אחת, אחרי הגיבוי), מתוך התיקייה `server`:
   ```bash
   node scripts/migratePermissions.js --apply
   ```
3. **Push** של הקוד ל-GitHub, כדי שהשרת יוכל למשוך אותו.

## 1. הכנת השרת (פעם אחת)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

**חומת אש:** פותחים רק SSH ו-nginx. פורט 5000 נשאר סגור מבחוץ.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 2. הורדת הקוד

```bash
cd /var/www
sudo git clone https://github.com/Aymanw1998/Tamheed-Association-System.git tamheed
sudo chown -R $USER:$USER /var/www/tamheed
cd /var/www/tamheed
```

## 3. קובץ ההגדרות של השרת

```bash
cp server/config/.env.example server/config/.env
nano server/config/.env
```

| משתנה | ערך בשרת |
| --- | --- |
| `NODE_ENV` | `production` |
| `SERVE_CLIENT` | `true` (השרת מגיש גם את האתר) |
| `ALLOWED_ORIGINS` | ריק |
| `CLIENT_URL` | `https://הדומיין-שלך` |
| `MONGO_URI` | הכתובת מ-Atlas (`mongodb+srv://...`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **חדשים**, שתי מחרוזות אקראיות ארוכות (הפקודה בקובץ) |
| `PASSWORD_ENC_KEY_HEX` | **בדיוק אותו ערך כמו היום.** אם הוא ישתנה, אף אחד לא יוכל להיכנס |
| `SYSTEM_ADMIN_TZ`, `SYSTEM_ADMIN_PASSWORD`, `SYSTEM_ADMIN_EMAIL` | הערכים האמיתיים |
| `SMTP_*` | פרטי שרת המייל |
| `GOOGLE_REDIRECT_URI` | `https://הדומיין-שלך/api/storage/google/callback` |
| `STORAGE_SIGNED_URL_SECRET`, `STORAGE_SHARE_LINK_SECRET` | מחרוזות אקראיות חדשות |
| `AI_ENABLED` | `false` (אלא אם תרצה להפעיל) |

הגנה על הקובץ:

```bash
chmod 600 server/config/.env
```

## 4. Atlas ו-Google

- **Atlas:** ב-Network Access ← Add IP Address מוסיפים את כתובת ה-IP של השרת.
- **Google Cloud Console:** ב-OAuth Client מוסיפים ל-Authorized redirect URIs את
  `https://הדומיין-שלך/api/storage/google/callback`.

## 5. התקנה, בנייה והפעלה

```bash
bash deploy/update.sh
pm2 startup        # להריץ את הפקודה שהוא מדפיס, כדי שהשרת יעלה אחרי אתחול
```

בדיקה:

```bash
pm2 logs tamheed --lines 50
curl -s http://127.0.0.1:5000/api/health
```

## 6. nginx ו-HTTPS

```bash
sudo cp deploy/nginx-tamheed.conf /etc/nginx/sites-available/tamheed
sudo sed -i 's/example.org/הדומיין-שלך/' /etc/nginx/sites-available/tamheed
sudo ln -s /etc/nginx/sites-available/tamheed /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d הדומיין-שלך
```

## موقع الرياضة

אתר הספורט יושב על אותו שרת, ומזוהה לפי שם המארח (`sport.<domain>`).

1. **DNS:** מוסיפים רשומת `A` בשם `sport` שמצביעה על כתובת ה-IP של השרת (כמו הדומיין הראשי).
2. **nginx:** בהתקנה חדשה, הבלוק השני בקובץ `deploy/nginx-tamheed.conf` כבר נכלל בסעיף 6, וה-`sed` שם מחליף גם את `sport.example.org` לשם הדומיין שלך. בשרת שכבר פועל, certbot כבר שינה את הקובץ `/etc/nginx/sites-available/tamheed`, ולכן אין להעתיק אותו מחדש. מוסיפים לסוף הקובץ רק את בלוק ה-`server` של הספורט (עם שם הדומיין שלך), ואז מריצים `sudo nginx -t && sudo systemctl reload nginx`. אחר כך מפיקים תעודה:
   ```bash
   sudo certbot --nginx -d sport.<domain>
   ```
3. **קובץ ההגדרות** (`server/config/.env`): מוסיפים (או משנים) את המשתנים האלה:

   | משתנה | ערך בשרת |
   | --- | --- |
   | `SERVE_CLIENT` | `true` (חובה: בלי זה השרת לא מגיש את אתר הספורט) |
   | `SPORT_HOST` | `sport.<domain>` |
   | `SPORT_SESSION_SECRET` | מחרוזת ארוכה ואקראית, שנוצרת בפקודה הבאה |

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   הערך שמודפס הוא הסוד. מעתיקים אותו ל-`.env`, ולא שומרים אותו בשום מקום אחר.
4. **הפעלה מחדש עם הערכים החדשים:**
   ```bash
   pm2 restart tamheed --update-env
   ```
5. **בדיקה:**
   ```bash
   curl -sI https://sport.<domain>
   ```
   מצפים לתשובה `200` (או `302`) עם כותרות HTTPS. תשובת `502` פירושה שהשרת לא עלה, ואז בודקים `pm2 logs tamheed`.

## 7. בדיקה אחרי ההעלאה

1. נכנסים ל-`https://הדומיין-שלך` עם חשבון מערכת, ומחליפים סיסמה.
2. בודקים כניסה עם מנהל, מדריך ועוזר: כל אחד רואה רק את מה שמותר לו.
3. מחברים את Google Drive מעמוד הקבצים (בחשבון המערכת), ומעלים קובץ קטן.
4. ממלאים "שכחתי סיסמה", ובודקים שהמייל הגיע.
5. מריצים את המסע המודרך עד הסוף. בלשונית Network ב-DevTools בודקים שלא נשלחה אף שמירה חוץ מ-`/api/tours`.
6. מייצאים דוח ל-PDF.

## עדכונים בהמשך

אחרי כל push:

```bash
cd /var/www/tamheed && bash deploy/update.sh
```

## אם משהו לא עובד

| תסמין | מה לבדוק |
| --- | --- |
| 502 Bad Gateway | `pm2 logs tamheed`: השרת נפל או לא עלה |
| `querySrv ECONNREFUSED` / אין חיבור ל-DB | ה-IP של השרת לא נמצא ב-Network Access של Atlas |
| ההתראות החיות לא מגיעות | שהבלוק `live/stream` קיים בקובץ ה-nginx |
| חיבור Drive נכשל | `GOOGLE_REDIRECT_URI` זהה בדיוק בקובץ `.env` וב-Google Console |
| אף אחד לא מצליח להיכנס אחרי ההעלאה | `PASSWORD_ENC_KEY_HEX` לא זהה לערך הישן |
