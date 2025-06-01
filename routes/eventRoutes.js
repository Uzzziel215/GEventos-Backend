const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for file uploads
const uploadsDir = path.join(__dirname, '../uploads/events');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Event Routes (GET all, GET by ID, POST new event - OMITTED FOR BREVITY, assume they are correct from previous versions)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT e.*, l.nombre as lugarNombre, l.direccion as lugarDireccion, l.capacidadMaxima as lugarCapacidadMaxima '
            + 'FROM Evento e JOIN Lugar l ON e.lugarID = l.lugarID '
            + 'ORDER BY e.fecha ASC, e.horaInicio ASC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Error fetching events' });
    }
});

router.get('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const eventId = req.params.id;
    if (isNaN(eventId) || parseInt(eventId, 10) <= 0) {
        return res.status(400).json({ message: 'Invalid event ID provided.' });
    }
    try {
        const result = await pool.query(
            'SELECT e.*, l.nombre as lugarnombre, u.nombre as organizadornombre ' +
            'FROM Evento e ' +
            'JOIN Lugar l ON e.lugarID = l.lugarID ' +
            'JOIN Usuario u ON e.organizadorID = u.usuarioID ' +
            'WHERE e.eventoID = $1',
            [eventId]
        );
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Event not found' });
        }
    } catch (error) {
        console.error(`Error fetching event with ID ${eventId}:`, error);
        res.status(500).json({ message: `Error fetching event with ID ${eventId}` });
    }
});

router.post('/', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), upload.single('imagen'), async (req, res) => {
    const { nombre, descripcion, fecha, horaInicio, horaFin, precio, capacidad, estado, tipo, lugarID, organizadorID } = req.body;
    const imagen = req.file ? req.file.filename : null;
    // Basic Validations (ensure all required fields are present and of correct type)
    // ... (omitted for brevity, assume they are correct)
    try {
        const result = await pool.query(
            'INSERT INTO Evento(nombre, descripcion, fecha, horaInicio, horaFin, precio, capacidad, estado, imagen, tipo, fechaCreacion, fechaModificacion, lugarID, organizadorID) '
            + 'VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12) RETURNING eventoID',
            [nombre, descripcion, fecha, horaInicio, horaFin, parseFloat(precio), parseInt(capacidad, 10), estado.toUpperCase(), imagen, tipo.toUpperCase(), parseInt(lugarID, 10), parseInt(organizadorID, 10)]
        );
        const newEventId = result.rows[0].eventoid;
        res.status(201).json({ message: 'Event created successfully', eventId: newEventId });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Error creating event' });
    }
});

router.put('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    // Event update logic (omitted for brevity)
});

router.delete('/:id', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    // Event delete logic (omitted for brevity)
});


// Layout and Seating Routes
router.get('/:eventoID/layout', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR', 'ASISTENTE']), async (req, res) => {
    const eventoID = req.params.eventoID;
    try {
        const eventQueryText = 'SELECT eventoID, lugarID AS lugarid FROM Evento WHERE eventoID = $1';
        const eventCheckResult = await pool.query(eventQueryText, [eventoID]);
        if (eventCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        console.log('[Backend DEBUG] GET /layout - eventCheckResult.rows[0]:', JSON.stringify(eventCheckResult.rows[0]));

        const croquisQuery = await pool.query('SELECT configuracion FROM Croquis WHERE eventoID = $1', [eventoID]);
        const croquis = croquisQuery.rows[0];
        const seatsQuery = await pool.query(
            'SELECT a.asientoID, a.codigo, a.fila, a.columna, a.estado, a.areaID AS areaid ' +
            'FROM Asiento a ' +
            'JOIN Area ar ON a.areaID = ar.areaID ' +
            'JOIN Lugar l ON ar.lugarID = l.lugarID ' +
            'JOIN Evento e ON l.lugarID = e.lugarID ' +
            'WHERE e.eventoID = $1 ORDER BY a.asientoID ASC',
            [eventoID]
        );
        res.status(200).json({
            layoutConfig: croquis ? croquis.configuracion : null,
            seats: seatsQuery.rows
        });
    } catch (error) {
        console.error(`Error fetching layout and seats for event ${eventoID}:`, error);
        res.status(500).json({ message: `Error fetching layout and seats for event ${eventoID}` });
    }
});

router.put('/:eventoID/layout', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const eventoID = req.params.eventoID;
    let { configuracionCroquis, asientos } = req.body; 

    try {
        // Esta es la única consulta para obtener los detalles del evento, incluyendo lugarid.
        const eventDetailsQuery = 'SELECT eventoID, lugarID AS lugarid FROM Evento WHERE eventoID = $1';
        console.log(`[Backend DEBUG] PUT /layout - Ejecutando consulta para eventDetails: ${eventDetailsQuery} con eventoID: ${eventoID}`);
        const eventDetailsResult = await pool.query(eventDetailsQuery, [eventoID]);
        
        if (eventDetailsResult.rows.length === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        const eventDetails = eventDetailsResult.rows[0]; 
        console.log('[Backend DEBUG] PUT /layout - eventDetails obtenido:', JSON.stringify(eventDetails));

        // Validaciones del payload
        if (configuracionCroquis !== undefined && (typeof configuracionCroquis !== 'object' || configuracionCroquis === null)) {
            return res.status(400).json({ error: 'Si se proporciona configuracionCroquis, debe ser un objeto válido.' });
        }
        if (!asientos || !Array.isArray(asientos)) {
            return res.status(400).json({ error: 'Se requiere un array de asientos válido.' });
        }
        // Add other necessary validations for asientos content if needed

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const lugarIDDelEvento = eventDetails.lugarid; 
            console.log('[Backend DEBUG] PUT /layout - lugarIDDelEvento extraído:', lugarIDDelEvento); 
            
            if (lugarIDDelEvento === undefined || lugarIDDelEvento === null) {
                console.error(`[Backend CRITICAL] PUT /layout - lugarIDDelEvento es nulo o indefinido para eventoID ${eventoID}. Deteniendo la transacción.`);
                await client.query('ROLLBACK');
                return res.status(500).json({ message: 'Error interno: No se pudo determinar el lugar del evento.' });
            }

            if (configuracionCroquis && configuracionCroquis.tables && Array.isArray(configuracionCroquis.tables)) {
                for (let i = 0; i < configuracionCroquis.tables.length; i++) {
                    const table = configuracionCroquis.tables[i];
                    if ((table.areaid && typeof table.areaid === 'number' && table.areaid > 1000000000) || (table.id && table.id.startsWith('new-table-'))) {
                        const tempAreaId = table.areaid;
                        console.log(`[Backend] Detectada nueva área potencial: id=${table.id}, tempAreaId=${tempAreaId}`);
                        const insertAreaParams = [`Área ${table.nombre || table.id}`, table.capacidad || 50, table.tipo || 'GENERAL', lugarIDDelEvento];
                        console.log('[Backend DEBUG PRE-INSERT Area] Params:', JSON.stringify(insertAreaParams));
                        
                        const newAreaResult = await client.query(
                            'INSERT INTO Area (nombre, capacidad, tipo, lugarID) VALUES ($1, $2, $3, $4) RETURNING areaID, nombre',
                            insertAreaParams
                        );
                        const realArea = newAreaResult.rows[0];
                        console.log(`[Backend] Nueva área creada en BD: ${JSON.stringify(realArea)}`);
                        
                        configuracionCroquis.tables[i].areaid = realArea.areaid;
                        configuracionCroquis.tables[i].id = `area-${realArea.areaid}`; 

                        if (asientos && Array.isArray(asientos)) {
                            asientos.forEach(asiento => {
                                if (asiento.areaID === tempAreaId || asiento.areaid === tempAreaId) {
                                    asiento.areaID = realArea.areaid; 
                                    asiento.areaid = realArea.areaid; 
                                }
                            });
                        }
                    }
                }
            }
            
            const croquisCheck = await client.query('SELECT croquisID FROM Croquis WHERE eventoID = $1', [eventoID]);
            if (configuracionCroquis !== undefined) {
                if (croquisCheck.rows.length > 0) {
                    await client.query('UPDATE Croquis SET configuracion = $1, fechaModificacion = NOW() WHERE eventoID = $2', [configuracionCroquis, eventoID]);
                } else {
                    await client.query('INSERT INTO Croquis(eventoID, configuracion, fechaCreacion, fechaModificacion) VALUES($1, $2, NOW(), NOW())', [eventoID, configuracionCroquis]);
                }
            }

            if (asientos && Array.isArray(asientos)) {
                for (const asiento of asientos) {
                    const isNewSeat = asiento.asientoID === undefined || (typeof asiento.asientoID === 'number' && asiento.asientoID > 1000000000) || asiento.isNew;
                    if (isNewSeat) {
                        console.log(`[Backend] Creando nuevo asiento: ${JSON.stringify(asiento)}`);
                        if (!asiento.areaID || isNaN(parseInt(asiento.areaID)) || parseInt(asiento.areaID) <=0) {
                             console.error(`[Backend] Asiento nuevo ${asiento.codigo} no tiene un areaID válido (${asiento.areaID}). Omitiendo.`);
                             continue;
                        }
                        await client.query(
                            'INSERT INTO Asiento (codigo, fila, columna, estado, areaID) VALUES ($1, $2, $3, $4, $5) RETURNING asientoID, codigo, fila, columna, estado, areaID AS areaid',
                            [asiento.codigo, asiento.fila || null, asiento.columna || null, asiento.estado.toUpperCase(), asiento.areaID]
                        );
                    } else { 
                        const seatEventCheck = await client.query(
                            'SELECT a.asientoID FROM Asiento a JOIN Area ar ON a.areaID = ar.areaID WHERE a.asientoID = $1 AND ar.lugarID = $2',
                            [asiento.asientoID, lugarIDDelEvento]
                        );
                        if (seatEventCheck.rows.length > 0) {
                            await client.query(
                                'UPDATE Asiento SET estado = $1 WHERE asientoID = $2',
                                [asiento.estado.toUpperCase(), asiento.asientoID]
                            );
                        } else {
                            console.warn(`[Backend] Intento de actualizar asientoID ${asiento.asientoID} que no pertenece al evento ${eventoID}. Omitiendo.`);
                        }
                    }
                }
            }

            await client.query('COMMIT');
            
            const finalLayoutResponse = await client.query('SELECT configuracion FROM Croquis WHERE eventoID = $1', [eventoID]);
            const finalSeatsResponse = await client.query(
                'SELECT a.asientoID, a.codigo, a.fila, a.columna, a.estado, a.areaID AS areaid ' +
                'FROM Asiento a JOIN Area ar ON a.areaID = ar.areaID JOIN Evento e ON ar.lugarID = e.lugarID WHERE e.eventoID = $1 ORDER BY a.asientoID ASC',
                [eventoID]
            );

            res.status(200).json({ 
                message: 'Layout y asientos guardados exitosamente.',
                layoutConfig: finalLayoutResponse.rows[0] ? finalLayoutResponse.rows[0].configuracion : null,
                seats: finalSeatsResponse.rows
            });

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Transaction error during layout/seat update:', e);
            res.status(500).json({ message: 'Error saving layout and seat data', detail: e.message });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error in PUT /layout route:', error);
        res.status(500).json({ message: 'Error processing layout request', detail: error.message });
    }
});

router.delete('/:eventoID/areas/:areaID', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const { eventoID, areaID } = req.params;

    if (isNaN(parseInt(eventoID)) || parseInt(eventoID) <= 0 || isNaN(parseInt(areaID)) || parseInt(areaID) <= 0) {
        return res.status(400).json({ message: 'IDs de evento y área inválidos.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const eventCheck = await client.query('SELECT eventoID FROM Evento WHERE eventoID = $1', [eventoID]);
        if (eventCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Evento no encontrado.' });
        }

        const areaCheck = await client.query(
            'SELECT ar.areaID, ar.lugarID FROM Area ar ' +
            'JOIN Lugar l ON ar.lugarID = l.lugarID ' +
            'JOIN Evento e ON l.lugarID = e.lugarID ' +
            'WHERE ar.areaID = $1 AND e.eventoID = $2',
            [areaID, eventoID]
        );

        if (areaCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: `Área con ID ${areaID} no encontrada o no pertenece al evento ${eventoID}.` });
        }

        const deleteAreaResult = await client.query('DELETE FROM Area WHERE areaID = $1 RETURNING areaID', [areaID]);
        if (deleteAreaResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: `No se pudo eliminar el Área con ID ${areaID}.` });
        }
        console.log(`[Backend] Área con ID ${areaID} eliminada.`);

        const croquisResult = await client.query('SELECT croquisID, configuracion FROM Croquis WHERE eventoID = $1', [eventoID]);
        if (croquisResult.rows.length > 0) {
            let currentConfig = croquisResult.rows[0].configuracion;
            if (currentConfig && currentConfig.tables && Array.isArray(currentConfig.tables)) {
                currentConfig.tables = currentConfig.tables.filter(table => table.areaid !== parseInt(areaID));
                await client.query('UPDATE Croquis SET configuracion = $1, fechaModificacion = NOW() WHERE eventoID = $2', [currentConfig, eventoID]);
                console.log(`[Backend] Configuración de Croquis actualizada para evento ${eventoID} después de eliminar área ${areaID}.`);
            }
        }

        await client.query('COMMIT');
        
        const finalLayoutResponse = await client.query('SELECT configuracion FROM Croquis WHERE eventoID = $1', [eventoID]);
        const finalSeatsResponse = await client.query(
            'SELECT a.asientoID, a.codigo, a.fila, a.columna, a.estado, a.areaID AS areaid ' +
            'FROM Asiento a JOIN Area ar ON a.areaID = ar.areaID JOIN Evento e ON ar.lugarID = e.lugarID WHERE e.eventoID = $1 ORDER BY a.asientoID ASC',
            [eventoID]
        );
        
        res.status(200).json({ 
            message: `Área ${areaID} y sus asientos asociados eliminados exitosamente.`,
            layoutConfig: finalLayoutResponse.rows[0] ? finalLayoutResponse.rows[0].configuracion : { tables: [] },
            seats: finalSeatsResponse.rows
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error eliminando área ${areaID} para evento ${eventoID}:`, error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar el área.', detail: error.message });
    } finally {
        client.release();
    }
});

// El endpoint POST /:eventoID/asientos se mantiene por si se usa en otro lugar,
// pero la lógica principal de creación de asientos para el croquis ahora está en PUT /:eventoID/layout
router.post('/:eventoID/asientos', authenticateToken, authorizeRoles(['ORGANIZADOR', 'ADMINISTRADOR']), async (req, res) => {
    const { eventoID } = req.params;
    const { codigo, fila, columna, estado, areaID } = req.body; 

    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
        return res.status(400).json({ message: 'El código del asiento es requerido.' });
    }
    if (areaID === undefined || isNaN(parseInt(areaID)) || parseInt(areaID) <= 0) {
        return res.status(400).json({ message: 'Un areaID válido es requerido.' });
    }
    const validSeatStates = ['DISPONIBLE', 'OCUPADO', 'RESERVADO', 'BLOQUEADO']; 
    if (!estado || !validSeatStates.includes(estado.toUpperCase())) {
        return res.status(400).json({ message: `Estado de asiento inválido. Use uno de: ${validSeatStates.join(', ')}.` });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const eventCheck = await client.query('SELECT lugarID FROM Evento WHERE eventoID = $1', [eventoID]);
        if (eventCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Evento no encontrado.' });
        }
        const lugarIDDelEvento = eventCheck.rows[0].lugarid;

        const areaCheck = await client.query('SELECT areaID FROM Area WHERE areaID = $1 AND lugarID = $2', [areaID, lugarIDDelEvento]);
        if (areaCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `El área con ID ${areaID} no existe o no pertenece al lugar del evento.` });
        }

        const insertQuery = `
            INSERT INTO Asiento (codigo, fila, columna, estado, areaID)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING asientoID, codigo, fila, columna, estado, areaID;
        `;
        const parsedFila = (fila !== undefined && !isNaN(parseInt(fila))) ? parseInt(fila) : null;
        const parsedColumna = (columna !== undefined && !isNaN(parseInt(columna))) ? parseInt(columna) : null;

        const result = await client.query(insertQuery, [codigo.trim(), parsedFila, parsedColumna, estado.toUpperCase(), parseInt(areaID)]);
        const nuevoAsiento = result.rows[0];

        await client.query('COMMIT');
        res.status(201).json(nuevoAsiento);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creando asiento para evento ${eventoID}, area ${areaID}:`, error);
        res.status(500).json({ message: 'Error interno del servidor al crear el asiento.' });
    } finally {
        client.release();
    }
});

module.exports = router;
