// استيراد مكتبة SQLite
const Database = require('better-sqlite3');

// إنشاء (أو فتح) ملف قاعدة البيانات
// سيتم إنشاء ملف forum.db تلقائياً في مجلد المشروع
const db = new Database('forum.db');

// تفعيل وضع الكتابة الأجنبية (Foreign Keys) لضمان سلامة العلاقات
db.pragma('foreign_keys = ON');

// إنشاء جدول المستخدمين (تجريبي للتأكد من أن كل شيء يعمل)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`);

console.log('Connected to the database and created users table successfully.');

// تصدير قاعدة البيانات لاستخدامها في ملفات أخرى لاحقاً
module.exports = db;