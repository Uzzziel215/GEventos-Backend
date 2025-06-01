const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');

// Admin Panel Routes
// Activities Route
// Note: This route requires authentication and should also require authorization (isAdmin).
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Fetch all activities, joining with Usuario to get user details if not null
        const result = await pool.query(
            'SELECT a.*, u.nombre as usuarioNombre, u.correoElectronico as usuarioCorreo '
            + 'FROM Actividad a '
            + 'LEFT JOIN Usuario u ON a.usuarioID = u.usuarioID '
            + 'ORDER BY a.fecha DESC' // Order by most recent activity
        );

        res.status(200).json(result.rows);

    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ message: 'Error fetching activities' });
    }
});

module.exports = router;
