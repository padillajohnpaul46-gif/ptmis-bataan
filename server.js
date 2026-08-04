const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Enable CORS & JSON Parsing
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 2. Setup Upload Directory in /tmp for Cloud Host Compatibility
const uploadDir = path.join('/tmp', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded static files from /uploads route
app.use('/uploads', express.static(uploadDir));

// 3. Connect to SQLite Database
const db = new sqlite3.Database('./ptmis.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('📂 Connected to SQLite database (ptmis.db)');
    }
});

// Create Documents Table if not exists
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

// 4. Multer Configuration (10MB File Size Limit)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// 5. API Endpoints

// GET: Fetch all records
app.get('/api/records', (req, res) => {
    db.all('SELECT * FROM documents ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST: Add new record + file upload
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

// DELETE: Delete record and file
app.delete('/api/records/:id', (req, res) => {
    const recordId = req.params.id;

    db.get('SELECT filePath FROM documents WHERE id = ?', [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row && row.filePath && row.filePath !== '#') {
            const actualFileName = path.basename(row.filePath);
            const fullFilePath = path.join(uploadDir, actualFileName);
            if (fs.existsSync(fullFilePath)) {
                fs.unlinkSync(fullFilePath);
            }
        }

        db.run('DELETE FROM documents WHERE id = ?', [recordId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Record deleted successfully' });
        });
    });
});

// Fallback route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server on 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});