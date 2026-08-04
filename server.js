const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Use process.env.PORT for cloud deployment (Render, Railway, etc.), fallback to 3000 locally
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads folder exists on local disk
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Initialize SQLite Database File
const db = new sqlite3.Database('./ptmis.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('📂 Connected to permanent SQLite database (ptmis.db)');
    }
});

// Create Documents Table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        title TEXT,
        details TEXT,
        date TEXT,
        fileName TEXT,
        filePath TEXT
    )
`);

// Multer Storage Setup for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// API Endpoint: Fetch All Records from SQLite Database
app.get('/api/records', (req, res) => {
    db.all('SELECT * FROM documents ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API Endpoint: Insert New Document & File Metadata Permanently
app.post('/api/records', upload.single('file'), (req, res) => {
    const { category, title, details } = req.body;
    const file = req.file;

    const date = new Date().toISOString().split('T')[0];
    const fileName = file ? file.originalname : 'No File Attached';
    const filePath = file ? `/uploads/${file.filename}` : '#';

    const sql = `INSERT INTO documents (category, title, details, date, fileName, filePath) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [category, title, details, date, fileName, filePath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// API Endpoint: Delete Record from DB & Delete File from Disk
app.delete('/api/records/:id', (req, res) => {
    const recordId = req.params.id;

    // Retrieve file path to remove from storage disk
    db.get('SELECT filePath FROM documents WHERE id = ?', [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row && row.filePath && row.filePath !== '#') {
            const fullFilePath = path.join(__dirname, row.filePath);
            if (fs.existsSync(fullFilePath)) {
                fs.unlinkSync(fullFilePath);
            }
        }

        // Remove row record from SQLite table
        db.run('DELETE FROM documents WHERE id = ?', [recordId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Record deleted successfully' });
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PTMIS Server is running on port ${PORT}`);
});