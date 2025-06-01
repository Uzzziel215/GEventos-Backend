const { Pool } = require('pg');

require('dotenv').config(); // Load environment variables from .env file

// Database Configuration (Read from environment variables)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Use connection string from environment variable
});

// Optional: Test the connection on startup and log, but the pool handles connections lazily.
// It's often better to let the first query attempt connection or handle errors there.
// For now, we'll keep your initial connection log but add the crucial error handler for the pool.
pool.connect((err, client, release) => {
  if (err) {
    console.error('Initial database connection error', err.stack);
  } else {
    console.log('Successfully connected to database on startup check');
    if (client) client.release(); // Release the client back to the pool
  }
});

// IMPORTANT: Add an error listener to the pool itself
// This handles errors for idle clients in the pool, preventing crashes
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client in pool', err);
  // You might want to add more sophisticated error handling or logging here
  // For example, you could try to gracefully shut down or restart parts of your app,
  // but for now, just logging is better than crashing.
});

module.exports = {
  pool,
};
