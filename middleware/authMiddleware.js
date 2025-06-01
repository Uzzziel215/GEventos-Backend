const jwt = require('jsonwebtoken');

// JWT Secret (Read from environment variable)
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    process.exit(1); // Exit the process if secret is not defined
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  // Get token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

  if (token == null) {
    // If no token, return 401 Unauthorized
    return res.status(401).json({ message: 'Authentication token required' });
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      // If token is invalid, return 403 Forbidden
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // If token is valid, attach user information to request
    req.user = user; // user object contains { userId, role, nivelPermiso }
    next(); // Pass the request to the next middleware or route handler
  });
}

module.exports = authenticateToken;
