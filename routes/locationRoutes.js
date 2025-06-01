const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Lugar (Location) API Routes
// GET /api/lugares - Get all locations (accessible to authenticated users who need to select a location)
router.get('/', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Lugar ORDER BY nombre ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching lugares:', error);
        res.status(500).json({ message: 'Error fetching lugares' });
    }
});

// GET /api/lugares/:id - Get a specific location by ID
router.get('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const lugarID = req.params.id;

    // Refined Validation: Check if lugarID is a valid number
    if (isNaN(lugarID) || parseInt(lugarID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid location ID provided.' });
    }

    try {
        const result = await pool.query('SELECT * FROM Lugar WHERE lugarID = $1', [lugarID]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Location not found' });
        }

    } catch (error) {
        console.error(`Error fetching lugar with ID ${lugarID}:`, error);
        res.status(500).json({ message: `Error fetching lugar with ID ${lugarID}` });
    }
});

// POST /api/lugares - Create a new location (Admin only)
router.post('/', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const { nombre, direccion, capacidadMaxima, descripcion } = req.body;

    // Refined Validations for location creation
    const errors = [];

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        errors.push('Nombre del lugar es requerido y debe ser una cadena no vacía.');
    }
    if (!direccion || typeof direccion !== 'string' || direccion.trim().length === 0) {
        errors.push('Dirección del lugar es requerida y debe ser una cadena no vacía.');
    }
    if (capacidadMaxima === undefined || capacidadMaxima === null || isNaN(capacidadMaxima) || parseInt(capacidadMaxima, 10) <= 0) {
        errors.push('Capacidad máxima es requerida y debe ser un número entero positivo.');
    }
    // Basic validation for descripcion (optional)
    if (descripcion !== undefined && descripcion !== null && typeof descripcion !== 'string') {
         errors.push('Descripción debe ser una cadena o nulo.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ messages: errors });
    }

    // Convert capacity to integer
    const parsedCapacidadMaxima = parseInt(capacidadMaxima, 10);

    try {
        // Insert new location
        const result = await pool.query(
            'INSERT INTO Lugar(nombre, direccion, capacidadMaxima, descripcion) VALUES($1, $2, $3, $4) RETURNING lugarID',
            [nombre, direccion, parsedCapacidadMaxima, descripcion]
        );

        const newLugarId = result.rows[0].lugarid; // Lowercase as returned by pg

        res.status(201).json({ message: 'Location created successfully', lugarId: newLugarId });

    } catch (error) {
        console.error('Error creating lugar:', error);
        res.status(500).json({ message: 'Error creating lugar' });
    }
});

// PUT /api/lugares/:id - Update a specific location by ID (Admin only)
router.put('/:id', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const lugarID = req.params.id;
    const { nombre, direccion, capacidadMaxima, descripcion } = req.body;

    // Refined Validations for location update
    const errors = [];

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        errors.push('Nombre del lugar es requerido y debe ser una cadena no vacía.');
    }
    if (!direccion || typeof direccion !== 'string' || direccion.trim().length === 0) {
        errors.push('Dirección del lugar es requerida y debe ser una cadena no vacía.');
    }
    if (capacidadMaxima === undefined || capacidadMaxima === null || isNaN(capacidadMaxima) || parseInt(capacidadMaxima, 10) <= 0) {
        errors.push('Capacidad máxima es requerida y debe ser un número entero positivo.');
    }
    // Basic validation for descripcion (optional)
    if (descripcion !== undefined && descripcion !== null && typeof descripcion !== 'string') {
         errors.push('Descripción debe ser una cadena o nulo.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ messages: errors });
    }

    // Convert capacity to integer
    const parsedCapacidadMaxima = parseInt(capacidadMaxima, 10);

    try {
        // Update location
        const result = await pool.query(
            'UPDATE Lugar SET nombre = $1, direccion = $2, capacidadMaxima = $3, descripcion = $4 WHERE lugarID = $5 RETURNING lugarID',
            [nombre, direccion, parsedCapacidadMaxima, descripcion, lugarID]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Location updated successfully', lugarId: result.rows[0].lugarid });
        } else {
            res.status(404).json({ message: 'Location not found' });
        }

    } catch (error) {
        console.error('Error updating lugar:', error);
        res.status(500).json({ message: 'Error updating lugar' });
    }
});

// DELETE /api/lugares/:id - Delete a specific location by ID (Admin only)
router.delete('/:id', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const lugarID = req.params.id;

    // Refined Validation: Check if lugarID is a valid number and if the location exists
    if (isNaN(lugarID) || parseInt(lugarID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid location ID provided.' });
    }

    try {
        // Check if location exists before attempting deletion
        const lugarCheckResult = await pool.query('SELECT lugarID FROM Lugar WHERE lugarID = $1', [lugarID]);
        if (lugarCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Location not found.' });
        }

        // Proceed with deletion if location exists
        // Due to ON DELETE CASCADE on Evento table's fk_evento_lugar, events in this location will also be deleted.
        // Consider implications or add checks if you want to prevent deletion of locations with associated events.
        const result = await pool.query(
            'DELETE FROM Lugar WHERE lugarID = $1 RETURNING lugarID',
            [lugarID]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Location deleted successfully' });
        } else {
            // Should not happen if check above passed, but as a safety check
            res.status(404).json({ message: 'Location not found during deletion.' });
        }

    } catch (error) {
        console.error(`Error deleting lugar with ID ${lugarID}:`, error);
         // Check for specific errors if necessary, e.g., foreign key constraints if ON DELETE RESTRICT was used
        if (error.code === '23503') { // Foreign key violation (e.g., if ON DELETE RESTRICT was used and there are related events/areas)
             res.status(400).json({ message: 'Cannot delete location because it is associated with existing events or areas.' });
        } else {
            res.status(500).json({ message: `Error deleting lugar with ID ${lugarID}` });
        }
    }
});

module.exports = router;
