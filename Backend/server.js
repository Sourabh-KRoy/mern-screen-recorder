import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sqlite3pkg from "sqlite3";
import cors from "cors";

const sqlite3 = sqlite3pkg.verbose();

const __dirname = path.resolve();

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

//cors setup
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://mern-screen-recorder-five.vercel.app/",
      true,
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// SQLite Setup
const db = new sqlite3.Database(path.join(__dirname, "database.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      size INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName =
      Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, safeName);
  },
});
const upload = multer({ storage });

//Routes
app.post("/api/recordings", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { filename, size } = req.file;
  db.run(
    "INSERT INTO recordings (filename, size) VALUES (?, ?)",
    [filename, size],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({
        id: this.lastID,
        filename,
        size,
        url: `/uploads/${filename}`,
        createdAt: new Date().toISOString(),
      });
    }
  );
});

app.get("/api/recordings", (req, res) => {
  db.all(
    "SELECT * FROM recordings ORDER BY createdAt DESC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const result = rows.map((r) => ({
        ...r,
        url: `/uploads/${r.filename}`,
      }));
      res.json(result);
    }
  );
});

app.get("/api/recordings/:id", (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM recordings WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Not found" });

    res.json({
      ...row,
      url: `/uploads/${row.filename}`,
    });
  });
});

// Serve uploaded files
app.use("/uploads", express.static(UPLOAD_DIR));

// Start server
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
