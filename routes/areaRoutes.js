const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Area API Routes
// GET /api/lugares/:lugarID/areas - Get all areas for a specific location (accessible to authenticated users)
router.get('/lugares/:lugarID/areas', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const lugarID = req.params.lugarID;

    // Refined Validation: Check if lugarID is a valid number
    if (isNaN(lugarID) || parseInt(lugarID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid location ID provided.' });
    }

    try {
        // Optional: Check if the location exists before fetching areas
        const lugarCheck = await pool.query('SELECT lugarID FROM Lugar WHERE lugarID = $1', [lugarID]);
        if (lugarCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Location not found.' });
        }

        const result = await pool.query('SELECT * FROM Area WHERE lugarID = $1 ORDER BY nombre ASC', [lugarID]);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error(`Error fetching areas for lugar ID ${lugarID}:`, error);
        res.status(500).json({ message: `Error fetching areas for lugar ID ${lugarID}` });
    }
});

// GET /api/areas/:id - Get a specific area by ID
router.get('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const areaID = req.params.id;

    // Refined Validation: Check if areaID is a valid number
    if (isNaN(areaID) || parseInt(areaID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid area ID provided.' });
    }

    try {
        const result = await pool.query('SELECT * FROM Area WHERE areaID = $1', [areaID]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Area not found' });
        }

    } catch (error) {
        console.error(`Error fetching area with ID ${areaID}:`, error);
        res.status(500).json({ message: `Error fetching area with ID ${areaID}` });
    }
});

// POST /api/lugares/:lugarID/areas - Create a new area for a specific location (Admin or Organizer)
router.post('/lugares/:lugarID/areas', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const lugarID = req.params.lugarID;
    const { nombre, capacidad, tipo } = req.body;

    // Refined Validations:
    // 1. Check if lugarID is a valid number
    // 2. Check if location exists
    // 3. Validate nombre, capacidad, and tipo from body

    if (isNaN(lugarID) || parseInt(lugarID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid location ID provided in URL.' });
    }

    const errors = [];

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        errors.push('Nombre del área es requerido y debe ser una cadena no vacía.');
    }
    if (capacidad === undefined || capacidad === null || isNaN(capacidad) || parseInt(capacidad, 10) <= 0) {
        errors.push('Capacidad es requerida y debe ser un número entero positivo.');
    }
    const validAreaTypes = ['GENERAL', 'VIP', 'ESCENARIO', 'RESERVADO'];
    if (!tipo || typeof tipo !== 'string' || !validAreaTypes.includes(tipo.toUpperCase())) {
        errors.push(`Tipo de área inválido. Use uno de: ${validAreaTypes.join(', ')}.`);
    }

    if (errors.length > 0) {
        return res.status(400).json({ messages: errors });
    }

    const parsedCapacidad = parseInt(capacidad, 10);

    try {
        // Check if the location exists
        const lugarCheck = await pool.query('SELECT lugarID FROM Lugar WHERE lugarID = $1', [lugarID]);
        if (lugarCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Location not found.' });
        }

        // Insert new area
        const result = await pool.query(
            'INSERT INTO Area(nombre, capacidad, tipo, lugarID) VALUES($1, $2, $3, $4) RETURNING areaID',
            [nombre, parsedCapacidad, tipo.toUpperCase(), lugarID]
        );

        const newAreaId = result.rows[0].areaid; // Lowercase as returned by pg

        res.status(201).json({ message: 'Area created successfully', areaId: newAreaId });

    } catch (error) {
        console.error(`Error creating area for lugar ID ${lugarID}:`, error);
         // Check for specific foreign key violation errors if necessary
        if (error.code === '23503') { // Foreign key violation error code
             // This should be caught by the explicit lugarCheck, but as a fallback
             res.status(400).json({ message: 'Invalid lugarID.' });
        } else {
            res.status(500).json({ message: `Error creating area for lugar ID ${lugarID}` });
        }
    }
});

// PUT /api/areas/:id - Update a specific area by ID (Admin or Organizer)
router.put('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const areaID = req.params.id;
    const { nombre, capacidad, tipo, lugarID } = req.body; // lugarID can be updated, but requires careful handling (e.g., moving seats)

    // Refined Validations for area update
    // 1. Check if areaID is a valid number
    // 2. Validate provided fields in body

    if (isNaN(areaID) || parseInt(areaID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid area ID provided.' });
    }

    const updateFields = {};
    const errors = [];

    if (nombre !== undefined) {
        if (typeof nombre !== 'string' || nombre.trim().length === 0) {
            errors.push('Si se proporciona nombre, debe ser una cadena no vacía.');
        } else {
            updateFields.nombre = nombre;
        }
    }

    if (capacidad !== undefined) {
        if (isNaN(capacidad) || parseInt(capacidad, 10) <= 0) {
            errors.push('Si se proporciona capacidad, debe ser un número entero positivo.');
        } else {
            updateFields.capacidad = parseInt(capacidad, 10);
        }
    }

    const validAreaTypes = ['GENERAL', 'VIP', 'ESCENARIO', 'RESERVADO'];
    if (tipo !== undefined) {
        if (typeof tipo !== 'string' || !validAreaTypes.includes(tipo.toUpperCase())) {
            errors.push(`Si se proporciona tipo, debe ser uno de: ${validAreaTypes.join(', ')}.`);
        } else {
            updateFields.tipo = tipo.toUpperCase();
        }
    }

    // Allowing lugarID update requires careful consideration of potential associated seats and events.
    // For this preliminary version, let's disallow changing the lugarID via this route to keep it simpler.
    if (lugarID !== undefined) {
         errors.push('Cannot change the location (lugarID) of an area via this route.');
    }

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

    const queryText = `UPDATE Area SET ${queryParts.join(', ')} WHERE areaID = $${paramIndex} RETURNING areaID`;
    queryParams.push(areaID);

    try {
        // Update area
        const result = await pool.query(queryText, queryParams);

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Area updated successfully', areaId: result.rows[0].areaid });
        } else {
            res.status(404).json({ message: 'Area not found' });
        }

    } catch (error) {
        console.error(`Error updating area with ID ${areaID}:`, error);
        res.status(500).json({ message: `Error updating area with ID ${areaID}` });
    }
});

// DELETE /api/areas/:id - Delete a specific area by ID (Admin or Organizer)
router.delete('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const areaID = req.params.id;

    // Refined Validation: Check if areaID is a valid number and if the area exists
    if (isNaN(areaID) || parseInt(areaID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid area ID provided.' });
    }

    try {
        // Check if area exists before attempting deletion
        const areaCheckResult = await pool.query('SELECT areaID FROM Area WHERE areaID = $1', [areaID]);
        if (areaCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Area not found.' });
        }

        // Proceed with deletion if area exists
        // Due to ON DELETE CASCADE on Asiento table's fk_asiento_area, seats in this area will also be deleted.
        // Consider implications or add checks if you want to prevent deletion of areas with associated seats/events.
        const result = await pool.query(
            'DELETE FROM Area WHERE areaID = $1 RETURNING areaID',
            [areaID]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Area deleted successfully' });
        } else {
            // Should not happen if check above passed, but as a safety check
            res.status(404).json({ message: 'Area not found during deletion.' });
        }

    } catch (error) {
        console.error(`Error deleting area with ID ${areaID}:`, error);
         // Check for specific errors if necessary, e.g., foreign key constraints if ON DELETE RESTRICT was used
        if (error.code === '23503') { // Foreign key violation (e.g., if ON DELETE RESTRICT was used and there are related seats)
             res.status(400).json({ message: 'Cannot delete area because it is associated with existing seats.' });
        } else {
            res.status(500).json({ message: `Error deleting area with ID ${areaID}` });
        }
    }
});

module.exports = router;
