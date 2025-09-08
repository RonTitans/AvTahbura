# 🚌 מערכת פניות תחבורה ציבורית - AvTahbura

מערכת חכמה לניהול וחיפוש פניות בנושא תחבורה ציבורית עם תמיכה בשלושה מצבי חיפוש מתקדמים.

## ✨ תכונות עיקריות

### 🔍 שלושה מצבי חיפוש
1. **חיפוש רגיל** - חיפוש סמנטי חכם עם יצירת תשובות AI
2. **חיפוש מדויק** - חיפוש לפי מספר קו אוטובוס (עם התאמות מדויקות בלבד)
3. **חיפוש לפי מזהה פנייה** - הצגת ציר זמן כרונולוגי מלא של פנייה

### 🎯 יכולות נוספות
- ממשק בעברית מלא עם תמיכה RTL
- חיבור ישיר ל-Google Sheets
- יצירת תשובות רשמיות עם OpenAI GPT-4
- הצגת מספרי שורות מהגיליון האלקטרוני
- תצוגת ציר זמן ויזואלית עם חיצים ותאריכים מודגשים
- זיהוי אוטומטי של מספרי קווים
- שמירת מצב חיפוש ב-localStorage

## 🚀 התקנה והפעלה

### דרישות מקדימות
- Node.js 18 ומעלה
- חשבון Google Cloud עם Sheets API מופעל
- מפתח API של OpenAI
- גיליון Google Sheets עם נתוני הפניות

### שלבי התקנה

1. **שכפל את הפרויקט**
```bash
git clone https://github.com/RonTitans/AvTahbura.git
cd AvTahbura
```

2. **התקן תלויות**
```bash
npm install
```

3. **הגדר משתני סביבה**

צור קובץ `.env` בתיקיית השורש:
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Google Sheets Configuration
SPREADSHEET_ID=your_google_sheet_id_here
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# Security
SESSION_SECRET=your_random_session_secret_here
ADMIN_PASSWORD=your_admin_password_here

# Server
PORT=8009
```

4. **הגדר Google Service Account**
- צור Service Account ב-Google Cloud Console
- הורד את קובץ ה-JSON של ה-credentials
- שמור אותו כ-`google-credentials.json` בתיקיית הפרויקט
- שתף את הגיליון עם כתובת המייל של ה-Service Account

5. **הפעל את השרת**
```bash
npm start
```

6. **גש למערכת**
```
http://localhost:8009
```

## 📱 פריסה ל-Vercel

### הכנה לפריסה

1. **המר את Google Credentials למחרוזת:**
```bash
node -e "console.log(JSON.stringify(require('./google-credentials.json')))"
```

2. **הגדר משתני סביבה ב-Vercel Dashboard:**
- `OPENAI_API_KEY` - מפתח OpenAI
- `SPREADSHEET_ID` - מזהה הגיליון
- `GOOGLE_CREDENTIALS_JSON` - תוכן ה-JSON כמחרוזת (מהשלב הקודם)
- `SESSION_SECRET` - מפתח הצפנה אקראי
- `ADMIN_PASSWORD` - סיסמת כניסה למערכת

3. **פרוס דרך Vercel:**
- חבר את ה-GitHub repository
- Vercel יזהה אוטומטית את ההגדרות מ-`vercel.json`

למדריך מלא: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

## 🔧 מבנה הפרויקט

```
AvTahbura/
├── server.js              # שרת Express ראשי
├── public/               
│   ├── index.html        # ממשק החיפוש הראשי
│   └── login.html        # עמוד התחברות
├── utils/
│   ├── googleSheets.js   # חיבור לוקאלי ל-Google Sheets
│   └── googleSheetsVercel.js  # חיבור תואם Vercel
├── vercel.json           # הגדרות Vercel
├── package.json          # תלויות Node.js
└── DEPLOYMENT_GUIDE.md   # מדריך פריסה מפורט
```

## 📊 מבנה הנתונים ב-Google Sheets

הגיליון חייב להכיל את העמודות הבאות בסדר הזה:
1. **מזהה פניה** - מזהה ייחודי (CAS-XXXXXX-XXXXXX)
2. **נושא** - נושא הפנייה
3. **תמצית** - תקציר הפנייה (משמש לחיפוש קווים)
4. **הפניה** - תוכן הפנייה המלא
5. **נוצר ב:** - תאריך יצירה
6. **נוצר על-ידי** - שם היוצר
7. **תיאור** - תשובה/הערות

## 🛡️ אבטחה

- כל המידע הרגיש נשמר במשתני סביבה
- אימות משתמש בכניסה למערכת
- הצפנת sessions עם express-session
- CORS מוגבל לדומיין המקור
- קובצי credentials לא נשמרים ב-Git (מוגדרים ב-.gitignore)

## 🔍 שימוש במערכת

### מצב חיפוש רגיל
- הקלד שאלה או נושא בשפה חופשית
- המערכת תמצא את התשובות הרלוונטיות ביותר
- לחץ על "ייצר תשובה רשמית" לקבלת תשובה מנוסחת

### מצב חיפוש מדויק
- הקלד מספר קו (לדוגמה: "קו 408" או "408")
- המערכת תציג רק תוצאות עם התאמה מדויקת למספר הקו
- תוצאות מוצגות עם מספרי שורות מהגיליון

### מצב חיפוש לפי מזהה
- הקלד מזהה פנייה (לדוגמה: "CAS-583898-Q7Y1K7")
- המערכת תציג ציר זמן מלא של הפנייה
- כולל הפנייה המקורית וכל התשובות בסדר כרונולוגי

## 📝 דרישות טכניות

### Dependencies עיקריות:
- Express.js - שרת ווב
- Google APIs - חיבור ל-Sheets
- OpenAI - יצירת תשובות
- dotenv - ניהול משתני סביבה
- express-session - ניהול sessions

### תאימות דפדפנים:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 תרומה

אנו מעודדים תרומות! אנא:
1. עשה Fork לפרויקט
2. צור branch חדש (`git checkout -b feature/amazing-feature`)
3. בצע commit לשינויים (`git commit -m 'Add amazing feature'`)
4. דחוף ל-branch (`git push origin feature/amazing-feature`)
5. פתח Pull Request

## 📄 רישיון

MIT License - ראה קובץ [LICENSE](LICENSE) לפרטים

## 👥 קרדיטים

פותח עבור שיפור השירות לתושבים בתחום התחבורה הציבורית

## 📧 יצירת קשר

לשאלות, בעיות או הצעות: [פתח Issue](https://github.com/RonTitans/AvTahbura/issues)

---
🚌 **נבנה עם ❤️ לשיפור התחבורה הציבורית**