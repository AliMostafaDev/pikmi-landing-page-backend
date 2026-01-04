

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Allow cookies/sessions
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});



const dbConfig = {
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'pikmi_db',
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });



const sessionStore = new MySQLStore({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
});

app.use(session({
  key: 'pikmi_session',
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' // HTTPS only in production
  }
}));




const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ 
    success: false, 
    message: 'Unauthorized. Please login.' 
  });
};


app.get('/api/landing/content', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT section_key, content FROM landing_content'
    );
    
    // Convert array to object for easier frontend access
    const content = {};
    rows.forEach(row => {
      content[row.section_key] = row.content;
    });
    
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Error fetching landing content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch landing page content'
    });
  }
});


app.get('/api/landing/content/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const [rows] = await pool.execute(
      'SELECT section_key, content FROM landing_content WHERE section_key = ?',
      [key]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        key: rows[0].section_key,
        content: rows[0].content
      }
    });
  } catch (error) {
    console.error('Error fetching landing content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch landing page content'
    });
  }
});


app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    const [rows] = await pool.execute(
      'SELECT id, username, password FROM admins WHERE username = ?',
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    const admin = rows[0];
    
    if (password !== admin.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    req.session.userId = admin.id;
    req.session.username = admin.username;
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: admin.id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});


app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    
    res.clearCookie('pikmi_session');
    res.json({
      success: true,
      message: 'Logout successful'
    });
  });
});


app.post('/api/admin/create', isAuthenticated, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters'
      });
    }
    
    if (password.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 3 characters'
      });
    }
    
    const [existing] = await pool.execute(
      'SELECT id FROM admins WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      [username, password]
    );
    
    const [rows] = await pool.execute(
      'SELECT id, username, created_at FROM admins WHERE id = ?',
      [result.insertId]
    );
    
    res.json({
      success: true,
      message: 'Admin created successfully',
      data: rows[0]
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    console.error('Error creating admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin'
    });
  }
});

/**
 * GET /api/admin/admins
 * Get all admin users
 * Protected route
 */
app.get('/api/admin/admins', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, created_at FROM admins ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admins'
    });
  }
});

/**
 * DELETE /api/admin/admins/:id
 * Delete an admin user (cannot delete yourself)
 * Protected route
 */
app.delete('/api/admin/admins/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = parseInt(id);
    const currentUserId = req.session.userId;
    
    if (adminId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }
    
    const [result] = await pool.execute(
      'DELETE FROM admins WHERE id = ?',
      [adminId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete admin'
    });
  }
});

/**
 * GET /api/admin/me
 * Get current admin user info
 * Protected route
 */
app.get('/api/admin/me', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, created_at FROM admins WHERE id = ?',
      [req.session.userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: rows[0].id,
        username: rows[0].username,
        created_at: rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user information'
    });
  }
});

// ============================================
// ADMIN DASHBOARD ROUTES (Protected)
// ============================================

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 * Protected route
 */
app.get('/api/admin/dashboard/stats', isAuthenticated, async (req, res) => {
  try {
    // Get counts
    const [adminCount] = await pool.execute('SELECT COUNT(*) as count FROM admins');
    const [contentCount] = await pool.execute('SELECT COUNT(*) as count FROM landing_content');
    
    res.json({
      success: true,
      data: {
        totalAdmins: adminCount[0].count,
        totalContentSections: contentCount[0].count,
        lastLogin: req.session.username
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

/**
 * GET /api/admin/content
 * Get all landing page content (admin view)
 * Protected route
 */
app.get('/api/admin/content', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, section_key, content, updated_at FROM landing_content ORDER BY section_key'
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content'
    });
  }
});

/**
 * PUT /api/admin/content/:id
 * Update landing page content
 * Protected route
 * Body: { content: "new content" }
 */
app.put('/api/admin/content/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }
    
    const [result] = await pool.execute(
      'UPDATE landing_content SET content = ? WHERE id = ?',
      [content, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }
    
    // Fetch updated content
    const [rows] = await pool.execute(
      'SELECT id, section_key, content, updated_at FROM landing_content WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Content updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update content'
    });
  }
});

/**
 * POST /api/admin/content
 * Create new landing page content section
 * Protected route
 * Body: { section_key: "key", content: "content" }
 */
app.post('/api/admin/content', isAuthenticated, async (req, res) => {
  try {
    const { section_key, content } = req.body;
    
    if (!section_key || !content) {
      return res.status(400).json({
        success: false,
        message: 'Section key and content are required'
      });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO landing_content (section_key, content) VALUES (?, ?)',
      [section_key, content]
    );
    
    const [rows] = await pool.execute(
      'SELECT id, section_key, content, updated_at FROM landing_content WHERE id = ?',
      [result.insertId]
    );
    
    res.json({
      success: true,
      message: 'Content created successfully',
      data: rows[0]
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Section key already exists'
      });
    }
    console.error('Error creating content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create content'
    });
  }
});

// ============================================
// IMAGE MANAGEMENT ROUTES (Protected)
// ============================================

/**
 * GET /api/admin/images
 * Get all uploaded images
 * Protected route
 */
app.get('/api/admin/images', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, section_key, image_url, alt_text, created_at FROM landing_images ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images'
    });
  }
});

/**
 * POST /api/admin/images/upload
 * Upload single or multiple images
 * Protected route
 * Form data: { images: File[] (or image: File for single), section_key: "hero_image", alt_text: "description" }
 */
app.post('/api/admin/images/upload', isAuthenticated, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), async (req, res) => {
  try {
    const { section_key, alt_text } = req.body;
    
    if (!section_key) {
      return res.status(400).json({
        success: false,
        message: 'Section key is required'
      });
    }
    
    // Handle single image upload
    if (req.files && req.files.image && req.files.image[0]) {
      const file = req.files.image[0];
      const imageUrl = `/uploads/${file.filename}`;
      
      const [result] = await pool.execute(
        'INSERT INTO landing_images (section_key, image_url, alt_text) VALUES (?, ?, ?)',
        [section_key, imageUrl, alt_text || '']
      );
      
      const [rows] = await pool.execute(
        'SELECT id, section_key, image_url, alt_text, created_at FROM landing_images WHERE id = ?',
        [result.insertId]
      );
      
      return res.json({
        success: true,
        message: 'Image uploaded successfully',
        data: rows[0]
      });
    }
    
    // Handle multiple images upload (for screenshots)
    if (req.files && req.files.images && req.files.images.length > 0) {
      const uploadedImages = [];
      
      for (const file of req.files.images) {
        const imageUrl = `/uploads/${file.filename}`;
        const [result] = await pool.execute(
          'INSERT INTO landing_images (section_key, image_url, alt_text) VALUES (?, ?, ?)',
          [section_key, imageUrl, alt_text || '']
        );
        
        const [rows] = await pool.execute(
          'SELECT id, section_key, image_url, alt_text, created_at FROM landing_images WHERE id = ?',
          [result.insertId]
        );
        uploadedImages.push(rows[0]);
      }
      
      return res.json({
        success: true,
        message: `${uploadedImages.length} image(s) uploaded successfully`,
        data: uploadedImages
      });
    }
    
    return res.status(400).json({
      success: false,
      message: 'No image file(s) provided'
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image'
    });
  }
});

/**
 * GET /api/landing/images/:section_key
 * Get images for a specific section (public)
 */
app.get('/api/landing/images/:section_key', async (req, res) => {
  try {
    const { section_key } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, section_key, image_url, alt_text FROM landing_images WHERE section_key = ? ORDER BY created_at DESC',
      [section_key]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images'
    });
  }
});

/**
 * DELETE /api/admin/images/:id
 * Delete an image
 * Protected route
 */
app.delete('/api/admin/images/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image info before deleting
    const [imageRows] = await pool.execute(
      'SELECT image_url FROM landing_images WHERE id = ?',
      [id]
    );
    
    if (imageRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Delete from database
    await pool.execute('DELETE FROM landing_images WHERE id = ?', [id]);
    
    // Delete file from filesystem
    const imagePath = path.join(__dirname, imageRows[0].image_url);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image'
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard API available at http://localhost:${PORT}/api/admin`);
  console.log(`🌐 Landing page API available at http://localhost:${PORT}/api/landing`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  pool.end();
  process.exit(0);
});

