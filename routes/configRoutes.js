const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Config API Routes
// GET /api/config - Get general application configuration (accessible to authenticated users)
router.get('/', authenticateToken, authorizeRoles(['ASISTENTE', 'ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    try {
        // Assuming there is only one row in the Configuracion table for general settings
        const result = await pool.query('SELECT * FROM Configuracion LIMIT 1');

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            // Return a default/empty configuration or 404 if no config is found
            res.status(404).json({ message: 'Configuration not found.' });
        }

    } catch (error) {
        console.error('Error fetching configuration:', error);
        res.status(500).json({ message: 'Error fetching configuration' });
    }
});

// PUT /api/config - Update general application configuration (Admin only)
router.put('/', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const { nombreAplicacion, contactoEmail, version } = req.body;

    // Refined Validations for config update (only validate provided fields)
    const updateFields = {};
    const errors = [];

    if (nombreAplicacion !== undefined) {
        if (typeof nombreAplicacion !== 'string' || nombreAplicacion.trim() === '') {
            errors.push('Si se proporciona nombreAplicacion, debe ser una cadena no vacía.');
        } else {
            updateFields.nombreAplicacion = nombreAplicacion;
        }
    }

    if (contactoEmail !== undefined) {
        if (typeof contactoEmail !== 'string' || !/\S+@\S+\.\S+/.test(contactoEmail)) {
            errors.push('Si se proporciona contactoEmail, debe tener un formato válido.');
        } else {
            updateFields.contactoEmail = contactoEmail;
        }
    }

    if (version !== undefined) {
        if (typeof version !== 'string' || version.trim() === '') {
            errors.push('Si se proporciona version, debe ser una cadena no vacía.');
        } else {
            updateFields.version = version;
        }
    }

    // If there are validation errors, return 400
    if (errors.length > 0) {
        return res.status(400).json({ messages: errors });
    }

    // Check if there are any fields to update
    const fieldsToUpdateKeys = Object.keys(updateFields);
    if (fieldsToUpdateKeys.length === 0) {
         return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    // Construct the update query dynamically
    const queryParts = [];
    const queryParams = [];
    let paramIndex = 1;

    fieldsToUpdateKeys.forEach(key => {
        queryParts.push(`${key} = $${paramIndex}`);
        queryParams.push(updateFields[key]);
        paramIndex++;
    });

    // Add fechaModificacion update (handled by trigger, but good practice to include in query for clarity/manual updates if needed)
    // We don't need to manually update fechaModificacion here since the trigger handles it.

    // Assuming there is only one row with configID = 1 for general settings
    const queryText = `UPDATE Configuracion SET ${queryParts.join(', ')} WHERE configID = 1 RETURNING configID`;
    // No need to add configID to queryParams as it's hardcoded in WHERE clause

    try {
        const result = await pool.query(queryText, queryParams);

        if (result.rows.length > 0) {
            // Log configuration modification activity
            try {
                await pool.query(
                    'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                    [req.user.userId, 'MODIFICACION_CONFIGURACION', 'Configuración de aplicación modificada', JSON.stringify({ updatedFields: req.body }), req.ip]
                );
            } catch (activityLogError) {
                console.error('Error logging activity for config modification:', activityLogError);
                // Continue with update success even if activity logging fails
            }
            res.status(200).json({ message: 'Configuration updated successfully' });
        } else {
            // This case should ideally not happen if configID=1 always exists
            res.status(404).json({ message: 'Configuration not found.' });
        }

    } catch (error) {
        console.error('Error updating configuration:', error);
        res.status(500).json({ message: 'Error updating configuration' });
    }
});

module.exports = router;
