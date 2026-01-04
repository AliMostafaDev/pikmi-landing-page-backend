# Pikmi Backend - Simple Express + MySQL Server

A simple, single-file backend server for the Pikmi landing page with admin dashboard functionality.

## 🏗️ Architecture Overview

### Data Flow

```
Frontend (React) 
    ↓ HTTP Requests
Backend (Express) 
    ↓ SQL Queries
MySQL Database
    ↓ Session Storage
express-session (MySQL Store)
```

### Key Components

1. **server.js** - Single backend file containing:
   - Express server setup
   - MySQL connection pool
   - Session configuration
   - Authentication middleware
   - API routes (public + protected)

2. **Database Schema** - Two main tables:
   - `admins` - Admin user accounts
   - `landing_content` - Dynamic landing page content

3. **Authentication** - Session-based (no JWT):
   - Login creates a session
   - Protected routes check session
   - Logout destroys session

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Database

Create a `.env` file in the `backend` directory:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=pikmi_db

PORT=5000
NODE_ENV=development

FRONTEND_URL=http://localhost:3000

SESSION_SECRET=your-super-secret-session-key-change-this-in-production
```

### 3. Create Database and Tables

Run the SQL schema file:

```bash
# Option 1: Using MySQL command line
mysql -u root -p < schema.sql

# Option 2: Using MySQL Workbench or phpMyAdmin
# Open schema.sql and execute it
```

### 4. Generate Admin Password Hash (Optional)

If you want to use a custom password instead of the default:

```bash
node generate-password-hash.js your_password
```

Then update the `INSERT` statement in `schema.sql` with the generated hash.

### 5. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server will run on `http://localhost:5000`

## 📊 Database Schema

### Tables

#### `admins`
- `id` - Primary key
- `username` - Unique admin username
- `password` - Bcrypt hashed password
- `created_at` - Timestamp

#### `landing_content`
- `id` - Primary key
- `section_key` - Unique identifier (e.g., 'hero_title')
- `content` - Text content
- `updated_at` - Last update timestamp

### Default Admin Credentials

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **Change this password after first login!**

## 🔌 API Endpoints

### Public Endpoints (No Authentication)

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/landing/content`
Get all landing page content.

**Response:**
```json
{
  "success": true,
  "data": {
    "hero_title": "Ride Together. Help Together. Earn Pikmi Coins.",
    "hero_description": "Join a community-powered...",
    "hero_cta_primary": "Get Started",
    "hero_cta_secondary": "View Demo"
  }
}
```

#### `GET /api/landing/content/:key`
Get specific content by key.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "hero_title",
    "content": "Ride Together. Help Together. Earn Pikmi Coins."
  }
}
```

### Authentication Endpoints

#### `POST /api/admin/login`
Admin login.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "admin"
  }
}
```

#### `POST /api/admin/logout`
Admin logout.

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

#### `GET /api/admin/me`
Get current admin user info (Protected).

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Protected Admin Endpoints

All endpoints below require authentication (session).

#### `GET /api/admin/dashboard/stats`
Get dashboard statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAdmins": 1,
    "totalContentSections": 4,
    "lastLogin": "admin"
  }
}
```

#### `GET /api/admin/content`
Get all landing page content (admin view).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "section_key": "hero_title",
      "content": "Ride Together. Help Together. Earn Pikmi Coins.",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `PUT /api/admin/content/:id`
Update landing page content.

**Request Body:**
```json
{
  "content": "New content here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Content updated successfully",
  "data": {
    "id": 1,
    "section_key": "hero_title",
    "content": "New content here",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## 🔒 Authentication Flow

1. **Login:**
   - Client sends `POST /api/admin/login` with username/password
   - Server verifies credentials against database
   - If valid, creates session and sets `req.session.userId`
   - Returns success response

2. **Protected Routes:**
   - Client includes session cookie in requests (`credentials: 'include'`)
   - Server checks `isAuthenticated` middleware
   - If session exists, allows access; otherwise returns 401

3. **Logout:**
   - Client sends `POST /api/admin/logout`
   - Server destroys session
   - Returns success response

## 🎨 Frontend Integration

### Fetching Landing Page Content

```javascript
// In your React component
useEffect(() => {
  fetch('http://localhost:5000/api/landing/content')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Use data.data to access content
        setHeroTitle(data.data.hero_title);
      }
    });
}, []);
```

### Admin Login

```javascript
const handleLogin = async (username, password) => {
  const response = await fetch('http://localhost:5000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important for sessions!
    body: JSON.stringify({ username, password }),
  });
  
  const data = await response.json();
  if (data.success) {
    // Redirect to dashboard
  }
};
```

### Making Authenticated Requests

```javascript
const fetchDashboardData = async () => {
  const response = await fetch('http://localhost:5000/api/admin/dashboard/stats', {
    credentials: 'include', // Include session cookie
  });
  
  const data = await response.json();
  // Handle response
};
```

## 🛠️ Development Tips

1. **Database Connection Issues:**
   - Check MySQL is running: `mysql -u root -p`
   - Verify `.env` credentials
   - Ensure database exists: `SHOW DATABASES;`

2. **Session Issues:**
   - Clear browser cookies if sessions aren't working
   - Check `SESSION_SECRET` in `.env`
   - Verify `credentials: 'include'` in frontend requests

3. **CORS Issues:**
   - Update `FRONTEND_URL` in `.env` if frontend runs on different port
   - Check browser console for CORS errors

## 📝 File Structure

```
backend/
├── server.js                 # Main backend file
├── schema.sql                # Database schema
├── package.json              # Dependencies
├── .env                      # Environment variables (create this)
├── .env.example              # Example env file
├── .gitignore                # Git ignore rules
├── generate-password-hash.js # Password hash generator
└── README.md                 # This file
```

## 🔐 Security Notes

- ⚠️ Change default admin password in production
- ⚠️ Use strong `SESSION_SECRET` in production
- ⚠️ Enable HTTPS in production (`secure: true` in session config)
- ⚠️ Use environment variables for all sensitive data
- ⚠️ Consider rate limiting for login endpoints
- ⚠️ Sanitize user inputs (currently minimal)

## 🚧 Future Enhancements

- Content editing UI in dashboard
- Image upload for landing page
- Multiple admin roles
- Activity logging
- Password reset functionality
- API rate limiting

## 📞 Support

For issues or questions, check the code comments in `server.js` for detailed explanations of each section.

