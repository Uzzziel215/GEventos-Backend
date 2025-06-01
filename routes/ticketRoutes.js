const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Ticket Verification Routes
// Apply authentication middleware to ticket verification routes
// Note: These routes will ALSO require authorization checks (isAdmin or isOrganizer for the event) in a real application.
router.get('/:qrCode', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const qrCode = req.params.qrCode;

    // Refined Validation: Check if qrCode is provided and if a ticket with this QR code exists
    if (!qrCode || typeof qrCode !== 'string' || qrCode.trim() === '') {
        return res.status(400).json({ message: 'QR code is required.' });
    }

    try {
        // Fetch ticket by QR code, including event and user details
        const result = await pool.query(
            'SELECT t.*, e.nombre as eventName, u.nombre as userName, u.apellido as userApellido '
            + 'FROM Boleto t '
            + 'JOIN Evento e ON t.eventoID = e.eventoID '
            + 'JOIN Usuario u ON t.usuarioID = u.usuarioID '
            + 'WHERE t.qrCode = $1',
            [qrCode]
        );

        if (result.rows.length > 0) {
            const ticket = result.rows[0];

            if (ticket) {
                res.status(200).json(ticket);
            } else {
                res.status(404).json({ message: 'Ticket not found or invalid QR code' });
            }
        } else {
            res.status(404).json({ message: 'Ticket not found' });
        }

    } catch (error) {
        console.error(`Error fetching ticket with QR code ${qrCode}:`, error);
        res.status(500).json({ message: `Error fetching ticket with QR code ${qrCode}` });
    }
});

router.put('/:ticketID/verify', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const ticketID = req.params.ticketID;
    const { estado } = req.body; // Assuming 'estado' is the field to update, e.g., to 'VERIFICADO'

    // Refined Validations:
    // 1. Check if ticketID is a valid number
    // 2. Check if ticket exists
    // 3. Validate the provided 'estado'

    if (isNaN(ticketID) || parseInt(ticketID, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid ticket ID provided.' });
    }

    const validTicketStates = ['COMPRADO', 'VERIFICADO', 'CANCELADO']; // Define valid states for verification process
    if (!estado || typeof estado !== 'string' || !validTicketStates.includes(estado.toUpperCase())) {
        return res.status(400).json({ error: `Estado inválido. Use uno de los siguientes para verificar: ${validTicketStates.join(', ')}.` });
    }

    try {
        // Check if the ticket exists and fetch its current state
        const ticketCheckResult = await pool.query('SELECT boletoID, estado FROM Boleto WHERE boletoID = $1', [ticketID]);
        if (ticketCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        const currentTicket = ticketCheckResult.rows[0];

        // Optional: Prevent verifying an already verified ticket
        if (currentTicket.estado.toUpperCase() === 'VERIFICADO' && estado.toUpperCase() === 'VERIFICADO') {
             return res.status(400).json({ message: 'Ticket is already verified.' });
        }

        // Proceed with update if validations pass
        const updateResult = await pool.query(
            'UPDATE Boleto SET estado = $1 WHERE boletoID = $2 RETURNING boletoID',
            [estado.toUpperCase(), ticketID]
        );

        if (updateResult.rows.length > 0) {
            // Log activity for verification
            try {
                // We might need to fetch eventID and usuarioID for the ticket for better logging details
                const ticketDetailsForLog = await pool.query(
                    'SELECT eventoID, usuarioID FROM Boleto WHERE boletoID = $1',
                    [ticketID]
                );
                const details = ticketDetailsForLog.rows[0];

                await pool.query(
                    'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                    [req.user.userId, 'VERIFICACION_ASISTENCIA', `Ticket verificado (ID: ${ticketID})`, JSON.stringify({ ticketId: ticketID, attendedUserId: details.usuarioid, eventId: details.eventoid }), req.ip]
                );
            } catch (activityLogError) {
                console.error('Error logging activity for ticket verification:', activityLogError);
                // Continue with verification success even if activity logging fails
            }
            res.status(200).json({ message: 'Ticket verified successfully', ticketId: ticketID });
        } else {
             // Should not happen if ticket was found initially, but as a safety check
             res.status(404).json({ message: 'Ticket not found during update.' });
        }

    } catch (error) {
        console.error(`Error verifying ticket with ID ${ticketID}:`, error);
        res.status(500).json({ message: `Error verifying ticket with ID ${ticketID}` });
    }
});

module.exports = router;
