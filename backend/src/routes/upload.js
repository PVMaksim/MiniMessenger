const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

// Абсолютный путь к папке uploads
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Создаём папку если не существует
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024 },
});

// POST /upload
router.post('/', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
  res.json({
    url:  `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
  });
});

module.exports = router;
