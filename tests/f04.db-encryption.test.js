// ============================================================================
// tests/f04.db-encryption.test.js — P21: SQLCipher database encryption
// ----------------------------------------------------------------------------
// These tests create a real encrypted DB file and verify:
//   1. Encryption works when a password is set
//   2. Wrong password is rejected
//   3. Raw file bytes do NOT contain plaintext
//   4. Unencrypted DB opens fine without a password
// ============================================================================

const fs = require('fs');
const path = require('path');

let Database;
let cipherAvailable = true;
try {
  // eslint-disable-next-line global-require
  Database = require('better-sqlite3-multiple-ciphers');
} catch (_) {
  cipherAvailable = false;
}

const describeIf = cipherAvailable ? describe : describe.skip;

const testDbPath = path.join(__dirname, '..', 'data', 'test-encrypted.db');
const plainDbPath = path.join(__dirname, '..', 'data', 'test-plain.db');
const PASSWORD = 'test-encryption-password-123';

function cleanup(p) {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = p + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

describeIf('F04/P21 — Database Encryption (SQLCipher)', () => {
  beforeAll(() => {
    const dataDir = path.dirname(testDbPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    cleanup(testDbPath);
    cleanup(plainDbPath);
  });

  afterAll(() => {
    cleanup(testDbPath);
    cleanup(plainDbPath);
  });

  test('creates an encrypted DB and writes data', () => {
    const db = new Database(testDbPath);
    db.pragma(`key = '${PASSWORD}'`);
    db.exec('CREATE TABLE secret (id INTEGER PRIMARY KEY, data TEXT)');
    db.prepare('INSERT INTO secret (data) VALUES (?)').run('confidential');
    db.close();

    expect(fs.existsSync(testDbPath)).toBe(true);
    expect(fs.statSync(testDbPath).size).toBeGreaterThan(0);
  });

  test('raw file does NOT contain plaintext', () => {
    const buffer = fs.readFileSync(testDbPath);
    const text = buffer.toString('utf8');
    expect(text).not.toContain('confidential');
    expect(text).not.toContain('CREATE TABLE secret');
  });

  test('opens with correct password', () => {
    const db = new Database(testDbPath);
    db.pragma(`key = '${PASSWORD}'`);
    const row = db.prepare('SELECT data FROM secret').get();
    expect(row.data).toBe('confidential');
    db.close();
  });

  test('rejects wrong password', () => {
    const db = new Database(testDbPath);
    db.pragma(`key = 'wrong-password-xyz'`);
    expect(() => {
      db.prepare('SELECT data FROM secret').get();
    }).toThrow();
    db.close();
  });

  test('rejects no password', () => {
    const db = new Database(testDbPath);
    expect(() => {
      db.prepare('SELECT data FROM secret').get();
    }).toThrow();
    db.close();
  });

  test('plaintext DB opens fine without a password', () => {
    const db = new Database(plainDbPath);
    db.exec('CREATE TABLE plain (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO plain (v) VALUES (?)').run('hello');
    db.close();

    const db2 = new Database(plainDbPath);
    const row = db2.prepare('SELECT v FROM plain').get();
    expect(row.v).toBe('hello');
    db2.close();
  });
});