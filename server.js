   console.log("🚀 YASSER SERVER STARTED - VERSION 2.0 🚀");
const express = require('express');
const db = require('./database');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(cookieSession({
    name: 'forum_session',
    keys: ['super_secret_key_yasser_2026'],
    maxAge: 24 * 60 * 60 * 1000
}));

app.get('/', (req, res) => {
    res.send('Welcome to the Forum Project! Server is running successfully.');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send('Username and password are required.');
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        const result = stmt.run(username, hashedPassword);
        res.status(201).send(`User created successfully with ID: ${result.lastInsertRowid}`);
    } catch (error) {
        res.status(500).send('Error creating user: ' + error.message);
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send('Username and password are required.');
    try {
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        const user = stmt.get(username);
        if (!user) return res.status(401).send('Invalid username or password.');
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            req.session.userId = user.id;
            req.session.username = user.username;
            res.status(200).send('Login successful! Session created.');
        } else {
            res.status(401).send('Invalid username or password.');
        }
    } catch (error) {
        res.status(500).send('Error during login: ' + error.message);
    }
});

// --- هذا هو الجزء الذي كان مفقوداً أو لم يُحفظ ---
app.get('/me', (req, res) => {
    if (req.session.userId) {
        res.send('Hello, ' + req.session.username + '! You are logged in. (ID: ' + req.session.userId + ')');
    } else {
        res.status(401).send('You are not logged in.');
    }
});

app.post('/logout', (req, res) => {
    req.session = null;
    res.send('Logged out successfully.');
});
// ---------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port: http://localhost:${PORT}`);
});