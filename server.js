const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS & JSON handling
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Connect to SQLite Database
const db = new sqlite3.Database('./ptmis.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('📂 Connected to SQLite database (ptmis.db)');
    }
});

// Create Table
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

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// API: Get All Records
app.get('/api/records', (req, res) => {
    db.all('SELECT * FROM documents ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Upload Record + File
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

// API: Delete Record & File
app.delete('/api/records/:id', (req, res) => {
    const recordId = req.params.id;

    db.get('SELECT filePath FROM documents WHERE id = ?', [recordId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row && row.filePath && row.filePath !== '#') {
            const fullFilePath = path.join(__dirname, row.filePath);
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

// Serve index.html at root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server on 0.0.0.0 for Render host
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PTMIS Server running on port ${PORT}`);
});