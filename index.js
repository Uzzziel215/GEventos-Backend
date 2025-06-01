// GEventos Backend - index.js

const express = require('express');
const cors = require('cors'); // Assuming CORS will be needed for frontend communication
const path = require('path'); // Import path module

require('dotenv').config(); // Load environment variables from .env file

const authenticateToken = require('./middleware/authMiddleware');
const authorizeRoles = require('./middleware/roleMiddleware');
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const userRoutes = require('./routes/userRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const activityRoutes = require('./routes/activityRoutes');
const configRoutes = require('./routes/configRoutes');
const locationRoutes = require('./routes/locationRoutes');
const areaRoutes = require('./routes/areaRoutes');
const seatRoutes = require('./routes/seatRoutes');

const app = express();
const port = process.env.PORT || 3001; // Use port 3001 for backend

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust in production)
app.use(express.json()); // Parse JSON request bodies

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic Route
app.get('/', (req, res) => {
  res.send('GEventos Backend is running!');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/config', configRoutes);
app.use('/api/lugares', locationRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/asientos', seatRoutes);


// Start the server
app.listen(port, () => {
  console.log(`GEventos backend listening at http://localhost:${port}`);
});

// Error handling middleware (basic example)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
