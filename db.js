const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS uretim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator TEXT,
      makina TEXT,
      baslangic TEXT,
      bitis TEXT
    )
  `);
});

module.exports = db;
