const { Pool } = require('pg');

require('dotenv').config(); // Load environment variables from .env file

// Database Configuration (Read from environment variables)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Use connection string from environment variable
});

pool.connect(err => {
  if (err) {
    console.error('Database connection error', err.stack);
  } else {
    console.log('Connected to database');
  }
});

module.exports = {
  pool,
};
