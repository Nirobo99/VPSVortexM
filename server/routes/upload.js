const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create subdirectories based on file type
    let subDir = 'files';
    if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    } else if (file.mimetype.startsWith('audio/')) {
      subDir = 'audio';
    } else if (file.mimetype.startsWith('video/')) {
      subDir = 'videos';
    }

    const dir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a',
    'video/mp4', 'video/webm', 'video/ogg',
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 5 // Maximum 5 files at once
  }
});

/**
 * POST /api/upload - Upload files
 */
router.post('/', authMiddleware, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => {
      const relativePath = path.relative(path.join(__dirname, '..'), file.path);
      const url = `/uploads/${relativePath.replace(/\\/g, '/')}`;

      return {
        id: file.filename,
        originalName: file.originalname,
        url: url,
        size: file.size,
        mimeType: file.mimetype,
        type: getFileType(file.mimetype),
        uploadedAt: new Date().toISOString()
      };
    });

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

/**
 * POST /api/upload/single - Upload single file (for voice/video messages)
 */
router.post('/single', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const relativePath = path.relative(path.join(__dirname, '..'), req.file.path);
    const url = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    const fileInfo = {
      id: req.file.filename,
      originalName: req.file.originalname,
      url: url,
      size: req.file.size,
      mimeType: req.file.mimetype,
      type: getFileType(req.file.mimetype),
      uploadedAt: new Date().toISOString()
    };

    // For audio/video files, we could extract duration here
    if (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')) {
      // TODO: Add duration extraction using ffmpeg
      fileInfo.duration = null;
    }

    res.json({
      message: 'File uploaded successfully',
      file: fileInfo
    });
  } catch (error) {
    console.error('Single upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * DELETE /api/upload/:filename - Delete uploaded file
 */
router.delete('/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Find file in uploads directory
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Helper function to determine file type category
 */
function getFileType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'voice';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

module.exports = router;
