const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Asiento (Seat) API Routes
// GET /api/areas/:areaID/asientos - Get all seats for a specific area (accessible to authenticated users)
router.get('/areas/:areaID/asientos', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const areaID = req.params.areaID;

    // Refined Validation: Check if areaID is a valid number
    if (isNaN(areaID) || parseInt(areaID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid area ID provided in URL.' });
    }

    try {
        // Optional: Check if the area exists before fetching seats
        const areaCheck = await pool.query('SELECT areaID FROM Area WHERE areaID = $1', [areaID]);
        if (areaCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Area not found.' });
        }

        const result = await pool.query('SELECT * FROM Asiento WHERE areaID = $1 ORDER BY fila ASC, columna ASC', [areaID]);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error(`Error fetching asientos for area ID ${areaID}:`, error);
        res.status(500).json({ message: `Error fetching asientos for area ID ${areaID}` });
    }
});

// GET /api/asientos/:id - Get a specific seat by ID
router.get('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const asientoID = req.params.id;

    // Refined Validation: Check if asientoID is a valid number
    if (isNaN(asientoID) || parseInt(asientoID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid seat ID provided.' });
    }

    try {
        const result = await pool.query('SELECT * FROM Asiento WHERE asientoID = $1', [asientoID]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Seat not found' });
        }

    } catch (error) {
        console.error(`Error fetching asiento with ID ${asientoID}:`, error);
        res.status(500).json({ message: `Error fetching asiento with ID ${asientoID}` });
    }
});

// POST /api/areas/:areaID/asientos - Create new seats for a specific area (Admin or Organizer)
router.post('/areas/:areaID/asientos', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const areaID = req.params.areaID;
    const asientos = req.body; // Expecting an array of seat objects

    // Refined Validations:
    // 1. Check if areaID is a valid number
    // 2. Check if area exists
    // 3. Validate that the body is an array of valid seat objects

    if (isNaN(areaID) || parseInt(areaID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid area ID provided in URL.' });
    }

    if (!asientos || !Array.isArray(asientos) || asientos.length === 0) {
        return res.status(400).json({ message: 'Request body must be a non-empty array of seat objects.' });
    }

    const validSeatStates = ['DISPONIBLE', 'OCUPADO', 'RESERVADO', 'BLOQUEADO']; // Based on schema ENUM
    for (const asiento of asientos) {
        if (typeof asiento !== 'object' || asiento === null ||
            !('codigo' in asiento) || typeof asiento.codigo !== 'string' || asiento.codigo.trim().length === 0 ||
            !('estado' in asiento) || typeof asiento.estado !== 'string' || !validSeatStates.includes(asiento.estado.toUpperCase()) ||
            ('fila' in asiento && asiento.fila !== null && typeof asiento.fila !== 'number') || // fila and columna are optional/nullable in schema
            ('columna' in asiento && asiento.columna !== null && typeof asiento.columna !== 'number')
           ) {
            return res.status(400).json({ error: 'Each item in the array must be a valid seat object with required fields (codigo, estado) and optional number fields (fila, columna).' });
        }
    }

    try {
        // Check if the area exists
        const areaCheck = await pool.query('SELECT areaID FROM Area WHERE areaID = $1', [areaID]);
        if (areaCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Area not found.' });
        }

        // Insert new seats within a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const insertedSeatIds = [];
            for (const asiento of asientos) {
                const result = await client.query(
                    'INSERT INTO Asiento(codigo, fila, columna, estado, areaID) VALUES($1, $2, $3, $4, $5) RETURNING asientoID',
                    [asiento.codigo, asiento.fila || null, asiento.columna || null, asiento.estado.toUpperCase(), areaID]
                );
                insertedSeatIds.push(result.rows[0].asientoid);
            }

            await client.query('COMMIT');

            res.status(201).json({ message: 'Seats created successfully', asientoIds: insertedSeatIds });

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Transaction error during seat creation:', e);
             // Check for specific foreign key violation errors if necessary
            if (e.code === '23503') { // Foreign key violation error code
                 // This should be caught by the explicit areaCheck, but as a fallback
                 res.status(400).json({ message: 'Invalid areaID.' });
            } else {
                res.status(500).json({ message: 'Error creating seats' });
            }
        } finally {
            client.release();
        }

    } catch (error) {
        console.error(`Error creating seats for area ID ${areaID}:`, error);
        res.status(500).json({ message: `Error creating seats for area ID ${areaID}` });
    }
});

// PUT /api/asientos/:id - Update a specific seat by ID (Admin or Organizer)
router.put('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const asientoID = req.params.id;
    const { codigo, fila, columna, estado, areaID } = req.body; // areaID update disallowed for simplicity

    // Refined Validations for seat update
    // 1. Check if asientoID is a valid number
    // 2. Validate provided fields in body

    if (isNaN(asientoID) || parseInt(asientoID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid seat ID provided.' });
    }

    const updateFields = {};
    const errors = [];

    if (codigo !== undefined) {
        if (typeof codigo !== 'string' || codigo.trim().length === 0) {
            errors.push('Si se proporciona codigo, debe ser una cadena no vacía.');
        } else {
            updateFields.codigo = codigo;
        }
    }

    if (fila !== undefined && fila !== null) {
        if (typeof fila !== 'number' || fila <= 0) { // Assuming fila should be positive if provided
             errors.push('Si se proporciona fila, debe ser un número positivo.');
        } else {
             updateFields.fila = fila;
        }
    } else if (fila === null) { // Allow setting fila to null
         updateFields.fila = null;
    }

    if (columna !== undefined && columna !== null) {
        if (typeof columna !== 'number' || columna <= 0) { // Assuming columna should be positive if provided
             errors.push('Si se proporciona columna, debe ser un número positivo.');
        } else {
             updateFields.columna = columna;
        }
    } else if (columna === null) { // Allow setting columna to null
        updateFields.columna = null;
    }

    const validSeatStates = ['DISPONIBLE', 'OCUPADO', 'RESERVADO', 'BLOQUEADO'];
    if (estado !== undefined) {
        if (typeof estado !== 'string' || !validSeatStates.includes(estado.toUpperCase())) {
            errors.push(`Si se proporciona estado, debe ser uno de: ${validSeatStates.join(', ')}.`);
        } else {
            updateFields.estado = estado.toUpperCase();
        }
    }

    // Disallow changing the areaID for simplicity
    if (areaID !== undefined) {
         errors.push('Cannot change the area (areaID) of a seat via this route.');
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

    const queryText = `UPDATE Asiento SET ${queryParts.join(', ')} WHERE asientoID = $${paramIndex} RETURNING asientoID`;
    queryParams.push(asientoID);

    try {
        // Update seat
        const result = await pool.query(queryText, queryParams);

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Seat updated successfully', asientoId: result.rows[0].asientoid });
        } else {
            res.status(404).json({ message: 'Seat not found' });
        }

    } catch (error) {
        console.error(`Error updating asiento with ID ${asientoID}:`, error);
        res.status(500).json({ message: `Error updating asiento with ID ${asientoID}` });
    }
});

// DELETE /api/asientos/:id - Delete a specific seat by ID (Admin or Organizer)
router.delete('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const asientoID = req.params.id;

    // Refined Validation: Check if asientoID is a valid number
    if (isNaN(asientoID) || parseInt(asientoID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid seat ID provided.' });
    }

    try {
        // Check if seat exists before attempting deletion
        const seatCheckResult = await pool.query('SELECT asientoID FROM Asiento WHERE asientoID = $1', [asientoID]);
        if (seatCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Seat not found.' });
        }

        // Proceed with deletion if seat exists
        // Delete seat
        const result = await pool.query(
            'DELETE FROM Asiento WHERE asientoID = $1 RETURNING asientoID',
            [asientoID]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Seat deleted successfully' });
        } else {
            res.status(404).json({ message: 'Seat not found' });
        }

    } catch (error) {
        console.error(`Error deleting asiento with ID ${asientoID}:`, error);
        res.status(500).json({ message: `Error deleting asiento with ID ${asientoID}` });
    }
});

module.exports = router;
