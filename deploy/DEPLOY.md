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
6. **נתוני הדגמה (אופציונלי):** `cd server && node scripts/seedSportDemo.js --email=you@example.com` מוסיף תלמידים, שיעורי כדורגל ונוכחות לדוגמה כדי לנסות את האתר, ו-`node scripts/seedSportDemo.js --remove` מסיר רק אותם (כדורגל עצמו נשאר).

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

## תמונות שחקן (חיתוך מהרקע)

כשתלמיד עם תמונה מתווסף כשחקן כדורגל, השרת חותך אותו מהרקע ושומר "תמונת שחקן" שקופה ב-MongoDB (האוסף `SportPlayerPhotos`). כשמוחקים את השחקן או את התמונה, תמונת השחקן נמחקת. תלמיד בלי תמונה מקבל קלף בלי תמונה, כמו קודם.

- **הכלי:** המודל MODNet (רישיון Apache-2.0, כ-26MB) רץ על המעבד של השרת, בערך שנייה לתמונה, תמונה אחת בכל פעם. התמונות לא נשלחות לשום שירות חיצוני.
- **ההורדה:** `deploy/update.sh` מוריד את המודל פעם אחת ל-`server/models/modnet.onnx` ובודק את טביעת ה-SHA-256 שלו. בעדכונים הבאים הוא רואה שהקובץ קיים ולא מוריד שוב.
- **שחקנים קיימים:** שחקנים שנוספו לפני העדכון מקבלים תמונת שחקן ברקע, בפעם הראשונה שפותחים את רשימת השחקנים או שהתלמיד נכנס לאתר הספורט.
- **בלי המודל:** אם ההורדה נכשלה, האתר ממשיך לעבוד ומציג את התמונה הרגילה, וב-`pm2 logs tamheed` מופיעה פעם אחת השורה `portrait model missing`. אפשר להוריד שוב:

```bash
cd /var/www/tamheed && node server/scripts/fetchPortraitModel.js && pm2 reload tamheed
```

## אפליקציות והתראות

שני האתרים (המערכת ואתר הספורט) מותקנים כאפליקציה, ועובדים גם כשאין אינטרנט בחלק מהמסכים. התראות בטלפון דורשות מפתחות VAPID. בלי המפתחות הכל שאר עובד, ורק ההתראות כבויות.

### 1. יצירת המפתחות (פעם אחת)

מתוך התיקייה `server` בשרת:

```bash
npx web-push generate-vapid-keys
```

הפקודה מדפיסה מפתח ציבורי ומפתח פרטי. מעתיקים אותם ל-`server/config/.env` ולא שומרים אותם בשום מקום אחר.

### 2. קובץ ההגדרות

ב-`server/config/.env` מוסיפים את השלושה האלה:

| משתנה | ערך בשרת |
| --- | --- |
| `VAPID_PUBLIC_KEY` | המפתח הציבורי שהודפס |
| `VAPID_PRIVATE_KEY` | המפתח הפרטי שהודפס |
| `VAPID_SUBJECT` | `mailto:you@example.com` (כתובת קשר שלך) |

המפתחות האלה הם סודות. אף פעם לא מכניסים אותם ל-git או לקובץ בתיקייה הזו, וגם לא ל-`.env.example`.

ואז מפעילים מחדש עם הערכים החדשים:

```bash
pm2 restart tamheed --update-env
```

### 3. HTTPS

התראות והתקנת האפליקציה דורשות HTTPS. זה כבר פועל לפי סעיף 6, ואין צורך בשינוי.

### 4. התקנה בטלפון

- **Android:** נכנסים לאתר ולוחצים על הכפתור «تثبيت التطبيق».
- **iPhone:** פותחים את האתר ב-Safari, לוחצים על שיתוף (Share) ואז על «הוסף למסך הבית» (Add to Home Screen). התראות ב-iPhone דורשות iOS 16.4 ומעלה, ועובדות רק מהאפליקציה שהותקנה, לא מלשונית Safari.

### 5. הפעלת התראות

- **צוות:** בעמוד הפרופיל, בקטע «إشعارات الهاتف», מדליקים את ההתראות.
- **תלמידים (אתר הספורט):** לוחצים על הכפתור «فعّل التذكير بالتدريبات».

## MongoDB על השרת

בסיס הנתונים יושב על השרת עצמו במקום ב-Atlas, וכל פנייה אליו לוקחת פחות מאלפית שנייה במקום כ-220ms (Atlas החינמי באורגון). מסד הנתונים מקשיב רק לשרת עצמו (`127.0.0.1`), נדרשת סיסמה, ופורט 27017 נשאר סגור מבחוץ.

> הסיסמאות שיוצרים כאן נכנסות רק ל-`server/config/.env` בשרת. לא שומרים אותן בתיקייה הזו ולא שולחים אותן לאף אחד.

### 0. בדיקה מוקדמת: המעבד ומערכת ההפעלה

MongoDB 5 ומעלה דורש מעבד עם AVX:

```bash
grep -c avx /proc/cpuinfo
```

אם מודפס `0`, אי אפשר להתקין גרסה נתמכת, ועוצרים כאן (נשארים עם Atlas). אם מודפס מספר גדול מ-0, ממשיכים.

```bash
lsb_release -cs
```

צריך להופיע `jammy` (22.04) או `noble` (24.04).

### 1. זיכרון Swap (פעם אחת)

בשרת עם 2GB, ה-Swap מגן על MongoDB ועל בניית האתר מפני חוסר זיכרון.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 2. התקנת MongoDB 8.0

```bash
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
```

החבילה כוללת גם את `mongosh`, `mongodump` ו-`mongorestore`.

### 3. הגדרות: זיכרון מוגבל והאזנה מקומית בלבד

```bash
sudo nano /etc/mongod.conf
```

בודקים שהחלקים האלה נראים כך (ההזחה ברווחים, לא בטאב):

```yaml
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25

net:
  port: 27017
  bindIp: 127.0.0.1
```

מפעילים:

```bash
sudo systemctl enable --now mongod
sudo systemctl status mongod --no-pager
```

### 4. משתמשים וסיסמאות

מייצרים שתי סיסמאות אקראיות, אחת למנהל ואחת לאפליקציה, ומעתיקים כל אחת למקום בטוח רק לרגע:

```bash
openssl rand -hex 24
openssl rand -hex 24
```

נכנסים ל-`mongosh` (עדיין בלי סיסמה, כי ההרשאות עוד לא הופעלו):

```bash
mongosh
```

ויוצרים את שני המשתמשים. מחליפים את `<...>` בסיסמאות שיצרת:

```js
use admin
db.createUser({ user: "admin", pwd: "<סיסמת המנהל>", roles: ["root"] })
use tamheed_db
db.createUser({ user: "tamheed", pwd: "<סיסמת האפליקציה>", roles: [{ role: "readWrite", db: "tamheed_db" }] })
exit
```

מפעילים את דרישת הסיסמה. ב-`/etc/mongod.conf` מוסיפים:

```yaml
security:
  authorization: enabled
```

ומפעילים מחדש:

```bash
sudo systemctl restart mongod
```

### 5. העברת הנתונים מ-Atlas (בלילה, כ-10 דקות של השבתה)

**לפני הכול: שם המסד.** המדריך מניח `tamheed_db`. בודקים מה המערכת באמת משתמשת בו (הסקריפט קורא את `.env` כמו המערכת עצמה):

```bash
cd /var/www/tamheed && bash deploy/env-get.sh DB_NAME
```

אם מודפסת שורה ריקה, או `tamheed_db`, ממשיכים כמו שכתוב. אם מודפס שם אחר, משתמשים בשם הזה בכל מקום שכתוב בו `tamheed_db` (גם במשתמש מסעיף 4 ובשורת `MONGO_URI`).

**א. עוצרים את המערכת**, כדי שאף שמירה לא תלך לאיבוד באמצע:

```bash
pm2 stop tamheed
```

**ב. מעתיקים מ-Atlas** (קריאה בלבד: ב-Atlas שום דבר לא משתנה). הכתובת נלקחת מה-`.env` לקובץ הגדרות פרטי, כך שהסיסמה לא מופיעה במסך ולא ברשימת התהליכים:

```bash
cd /var/www/tamheed
umask 077
bash deploy/env-get.sh --mongo-config > /root/atlas-dump.yaml
mongodump --config=/root/atlas-dump.yaml --db=tamheed_db --gzip --archive=/root/atlas-tamheed.archive.gz
rm /root/atlas-dump.yaml
ls -lh /root/atlas-tamheed.archive.gz
```

**ג. משחזרים ל-MongoDB המקומי** (עם משתמש המנהל):

```bash
mongorestore --uri="mongodb://admin@127.0.0.1:27017/?authSource=admin" --gzip --archive=/root/atlas-tamheed.archive.gz
```

הפקודה מבקשת את סיסמת המנהל.

**ד. בודקים שהכול עבר.** סופרים מסמכים בכל אוסף, פה ושם:

```bash
mongosh "mongodb://admin@127.0.0.1:27017/tamheed_db?authSource=admin" --quiet --eval 'db.getCollectionNames().sort().forEach(c => print(c, db.getCollection(c).countDocuments()))'
```

**ה. מעבירים את המערכת למסד המקומי.** ב-`server/config/.env` משנים את השורה `MONGO_URI` (שומרים את הישנה בהערה, למקרה שצריך לחזור):

```
# MONGO_URI=mongodb+srv://...   (Atlas, ישן)
MONGO_URI=mongodb://tamheed:<סיסמת האפליקציה>@127.0.0.1:27017/tamheed_db?authSource=tamheed_db
```

**ו. מפעילים ובודקים:**

```bash
pm2 restart tamheed --update-env
pm2 logs tamheed --lines 30
cd /var/www/tamheed/server && node scripts/perfCheck.js
```

מצפים ל-`one database round trip` של פחות מ-5ms. אחר כך נכנסים למערכת ולאתר הספורט ובודקים שהכול נראה כרגיל.

**חזרה ל-Atlas, אם משהו לא עובד:** מחזירים את שורת `MONGO_URI` הישנה ומריצים `pm2 restart tamheed --update-env`. מה שנשמר במסד המקומי בינתיים לא יעבור אוטומטית ל-Atlas.

את ה-Cluster ב-Atlas משאירים לפחות שבוע כגיבוי נוסף, ולא שומרים בו כלום חדש.

### 6. גיבוי לילי

```bash
sudo crontab -e
```

מוסיפים שורה (כל לילה ב-02:30, נשמרים 14 ימים ב-`/var/backups/tamheed`). כדי שהגיבוי יהיה עקבי, הסקריפט עוצר את המערכת לכמה שניות בזמן ההעתקה ומפעיל אותה מחדש בכל מקרה, גם אם הגיבוי נכשל. מערכת שכבר הייתה עצורה (תחזוקה) נשארת עצורה. אם הוא לא מוצא את `tamheed` ב-pm2, הוא לא מגבה ומדווח על שגיאה ביומן. לכן מריצים את ה-cron של אותו משתמש שמריץ את pm2 (כאן `root`):

```
30 2 * * * bash /var/www/tamheed/deploy/mongo-backup.sh >> /var/log/tamheed-backup.log 2>&1
```

בדיקה מיידית:

```bash
bash /var/www/tamheed/deploy/mongo-backup.sh
ls -lh /var/backups/tamheed
```

> הגיבויים יושבים על אותו שרת. אם השרת עצמו נהרס, הם הולכים יחד איתו. עד שהגיבוי ל-Drive של שלב ב' ייבנה, מורידים מדי פעם עותק למחשב שלך (מהמחשב, לא מהשרת):
> ```bash
> scp root@system.tamheed-ramla.org:/var/backups/tamheed/tamheed-*.archive.gz .
> ```

שחזור של גיבוי (מוחק את מה שיש במסד ומחליף בגיבוי). קודם עוצרים את המערכת, כדי שאף שמירה לא תיכנס באמצע, ומפעילים אותה רק אחרי שבודקים:

```bash
pm2 stop tamheed
mongorestore --uri="mongodb://admin@127.0.0.1:27017/?authSource=admin" --gzip --archive=/var/backups/tamheed/<שם הקובץ> --nsInclude='tamheed_db.*' --drop
mongosh "mongodb://admin@127.0.0.1:27017/tamheed_db?authSource=admin" --quiet --eval 'db.getCollectionNames().sort().forEach(c => print(c, db.getCollection(c).countDocuments()))'
pm2 start tamheed
```

## אם משהו לא עובד

| תסמין | מה לבדוק |
| --- | --- |
| 502 Bad Gateway | `pm2 logs tamheed`: השרת נפל או לא עלה |
| אין התראות בטלפון | שהמפתחות ב-`server/config/.env` מוגדרים, ושהרצת `pm2 restart tamheed --update-env` |
| `querySrv ECONNREFUSED` / אין חיבור ל-DB | ה-IP של השרת לא נמצא ב-Network Access של Atlas |
| ההתראות החיות לא מגיעות | שהבלוק `live/stream` קיים בקובץ ה-nginx |
| אתר הספורט לא מתעדכן מיד | ש-nginx לא מאגר (`proxy_buffering off`) את `/api/sport-portal/live`, כמו בשאר הזרמים החיים: הבלוק קיים בקובץ ה-nginx |
| חיבור Drive נכשל | `GOOGLE_REDIRECT_URI` זהה בדיוק בקובץ `.env` וב-Google Console |
| אף אחד לא מצליח להיכנס אחרי ההעלאה | `PASSWORD_ENC_KEY_HEX` לא זהה לערך הישן |
| `MongoServerError: Authentication failed` | הסיסמה או `authSource` בשורת `MONGO_URI` לא תואמים למשתמש שנוצר במסד |
| `connect ECONNREFUSED 127.0.0.1:27017` | MongoDB לא רץ: `sudo systemctl status mongod` ו-`sudo journalctl -u mongod -n 50` |
| אין תמונות שחקן בקלף | `ls -la server/models/modnet.onnx` (כ-26MB). אם חסר: `node server/scripts/fetchPortraitModel.js`. אם `npm ci` נכשל על `sharp` או `onnxruntime-node`, השרת צריך Linux x64 או arm64 ו-Node 20.9 ומעלה (`node -v`) |
| `mongod` לא עולה אחרי ההתקנה | המעבד בלי AVX (סעיף 0), או טעות הזחה ב-`/etc/mongod.conf` |
