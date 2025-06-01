const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');

// Payment Routes
// Note: These routes will require authentication. Authorization (e.g., user paying for themselves) might be needed.
router.post('/eventos/:eventoID/pago', authenticateToken, async (req, res) => {
    const eventoID = req.params.eventoID;
    const usuarioID = req.user.userId; // User making the payment
    const { monto, metodoPagoID, referencia, boletos } = req.body; // Expected data: total amount, payment method, transaction reference, and array of tickets/seats

    // Basic validation
    if (!monto || !metodoPagoID || !referencia || !boletos || !Array.isArray(boletos) || boletos.length === 0) {
        return res.status(400).json({ message: 'Missing required payment or ticket information.' });
    }

    // TODO: Add more robust validation for monto (>=0), metodoPagoID (exists?), boletos structure (precio, asientoID?), etc.

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insert into Pago table
        // Assuming state is 'COMPLETADO' for simplicity in this initial implementation.
        // In a real system with payment gateways, state would be 'PENDIENTE' initially and updated by a webhook.
        const pagoInsertResult = await client.query(
            'INSERT INTO Pago(monto, fechaPago, metodoPagoID, referencia, estado, usuarioID, eventoID) VALUES($1, NOW(), $2, $3, $4, $5, $6) RETURNING pagoID',
            [monto, metodoPagoID, referencia, 'COMPLETADO', usuarioID, eventoID]
        );
        const newPagoID = pagoInsertResult.rows[0].pagoid; // Lowercase as returned by pg

        // 2. Insert into Boleto table(s) for each ticket
        const insertedBoletoIDs = [];
        for (const boleto of boletos) {
            // TODO: Validate each boleto object (precio, asientoID?)
            // TODO: Generate unique codigoQR
            const codigoQR = `QR_${eventoID}_${usuarioID}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`; // Simple placeholder QR code
            const boletoPrecio = boleto.precio; // Assuming precio comes with each ticket item
            const asientoID = boleto.asientoID || null; // AsientoID is optional
            const boletoUsuarioID = boleto.usuarioID || usuarioID; // User for the ticket (default to payer)

            const boletoInsertResult = await client.query(
                'INSERT INTO Boleto(fechaCompra, codigoQR, estado, precio, pagoID, asientoID, eventoID, usuarioID) VALUES(NOW(), $1, $2, $3, $4, $5, $6, $7) RETURNING boletoID',
                [codigoQR, 'ACTIVO', boletoPrecio, newPagoID, asientoID, eventoID, boletoUsuarioID]
            );
            insertedBoletoIDs.push(boletoInsertResult.rows[0].boletid); // Lowercase as returned by pg

            // TODO: If seat booking is involved, update Asiento state to 'OCUPADO' within the transaction.
        }

        // Log activity for purchase (tipo 'COMPRA')
        try {
            await client.query(
                'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                [usuarioID, 'COMPRA', `Compra realizada para Evento ${eventoID}`, JSON.stringify({ pagoId: newPagoID, boletoIds: insertedBoletoIDs, eventoID: eventoID, monto: monto }), req.ip]
            );
        } catch (activityLogError) {
            console.error('Error logging activity for purchase:', activityLogError);
            // Continue with payment success even if activity logging fails
        }

        await client.query('COMMIT');

        res.status(201).json({ message: 'Payment and tickets registered successfully', pagoId: newPagoID, boletoIds: insertedBoletoIDs });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Transaction error during payment registration:', e);
         // TODO: Improve error handling based on specific DB errors (e.g., FK violations, unique constraints)
        res.status(500).json({ message: 'Error registering payment and tickets' });
    } finally {
        client.release();
    }
});

// GET /pagos/:pagoId - Get details of a specific payment and its associated tickets
router.get('/pagos/:pagoId', authenticateToken, async (req, res) => {
    const pagoId = req.params.pagoId;
    const usuarioID = req.user.userId; // User requesting the payment details

    if (isNaN(pagoId) || parseInt(pagoId, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid payment ID provided.' });
    }

    const client = await pool.connect();
    try {
        // 1. Get payment details
        const paymentResult = await client.query(
            'SELECT p.*, e.nombre as eventName, l.nombre as locationName ' +
            'FROM Pago p ' +
            'JOIN Evento e ON p.eventoID = e.eventoID ' +
            'JOIN Lugar l ON e.lugarID = l.lugarID ' +
            'WHERE p.pagoID = $1',
            [pagoId]
        );

        if (paymentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found.' });
        }

        const payment = paymentResult.rows[0];

        // TODO: Add authorization check: Ensure the authenticated user is the one who made the payment
        // or has admin/organizer privileges for the event.
        // if (payment.usuarioid !== usuarioID && !req.user.roles.includes('ADMINISTRADOR') && !req.user.roles.includes('ORGANIZADOR')) {
        //     return res.status(403).json({ message: 'Unauthorized to view this payment.' });
        // }


        // 2. Get associated tickets
        const ticketsResult = await client.query(
            'SELECT b.*, a.nombre as asientoNombre ' +
            'FROM Boleto b ' +
            'LEFT JOIN Asiento a ON b.asientoID = a.asientoID ' + // LEFT JOIN because asientoID can be NULL
            'WHERE b.pagoID = $1',
            [pagoId]
        );

        const tickets = ticketsResult.rows;

        // Combine payment and ticket details
        const paymentDetails = {
            ...payment,
            boletos: tickets
        };

        res.status(200).json(paymentDetails);

    } catch (error) {
        console.error(`Error fetching payment details for ID ${pagoId}:`, error);
        res.status(500).json({ message: `Error fetching payment details for ID ${pagoId}` });
    } finally {
        client.release();
    }
});


module.exports = router;
