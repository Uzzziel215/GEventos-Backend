const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Import the pool from db.js
const bcrypt = require('bcrypt');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// User Management Routes (Admin)
// Apply authentication middleware to all user management routes
// Note: These routes will ALSO require authorization checks (isAdmin or specific permissions) in a real application.
router.get('/', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    try {
        // Fetch all users, joining with Asistente and Organizador to determine role
        const result = await pool.query(
            'SELECT u.usuarioID, u.nombre, u.correoElectronico, u.telefono, u.estado, u.ultimoAcceso, u.fechaCreacion, u.fechaModificacion, '
            + 'CASE WHEN a.usuarioID IS NOT NULL THEN \'ASISTENTE\' '
            + 'WHEN o.usuarioID IS NOT NULL THEN \'ORGANIZADOR\' '
            + 'ELSE NULL END as role, o.nivelPermiso '
            + 'FROM Usuario u '
            + 'LEFT JOIN Asistente a ON u.usuarioID = a.usuarioID '
            + 'LEFT JOIN Organizador o ON u.usuarioID = o.usuarioID '
            + 'ORDER BY u.usuarioID ASC'
        );

        // Exclude password hashes from the response
        const users = result.rows.map(user => {
            const { contraseñaHash, ...userInfo } = user;
            return userInfo;
        });

        res.status(200).json(users);

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

router.post('/', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const { nombre, correoElectronico, contraseña, telefono, estado, role, nivelPermiso, departamento } = req.body;

    // Refined Validations for user creation
    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
        return res.status(400).json({ error: 'El nombre es obligatorio y debe ser una cadena no vacía.' });
    }
    if (!correoElectronico || typeof correoElectronico !== 'string' || !/\S+@\S+\.\S+/.test(correoElectronico)) {
        return res.status(400).json({ error: 'El email es obligatorio y debe tener un formato válido.' });
    }
    if (!contraseña || typeof contraseña !== 'string' || contraseña.length < 8) {
        return res.status(400).json({ error: 'La contraseña es obligatoria y debe tener al menos 8 caracteres.' });
    }
    const validRoles = ['ASISTENTE', 'ORGANIZADOR', 'ADMINISTRADOR']; // Define valid roles based on your schema/requirements
    if (!role || typeof role !== 'string' || !validRoles.includes(role)) {
        return res.status(400).json({ error: `El rol es obligatorio y debe ser uno de los siguientes: ${validRoles.join(', ')}.` });
    }

    try {
        // Check if user already exists
        const userCheck = await pool.query('SELECT usuarioID FROM Usuario WHERE correoElectronico = $1', [correoElectronico]);
        if (userCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert into Usuario table
            const userInsertResult = await client.query(
                'INSERT INTO Usuario(nombre, correoElectronico, contraseñaHash, telefono, estado, fechaCreacion, fechaModificacion) VALUES($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING usuarioID',
                [nombre, correoElectronico, hashedPassword, telefono, estado.toUpperCase()]
            );
            const newUserId = userInsertResult.rows[0].usuarioid; // Lowercase 'usuarioid'

            // Insert into appropriate role table
            if (role === 'ASISTENTE') {
                await client.query('INSERT INTO Asistente(usuarioID) VALUES($1)', [newUserId]);
            } else if (role === 'ORGANIZADOR' || role === 'ADMINISTRADOR') {
                 // Both ORGANIZADOR and ADMINISTRADOR roles are stored in the Organizador table with different nivelPermiso
                await client.query('INSERT INTO Organizador(usuarioID, departamento, nivelPermiso) VALUES($1, $2, $3)', [newUserId, departamento, nivelPermiso.toUpperCase()]); // Use validated departamento
            }
            // Note: A user could potentially exist *only* in the Usuario table if role is not one of the above, though schema implies everyone is either Asistente or Organizador (including admin). The schema defines nivelpermiso in Organizador.
            // Based on schema, ADMINISTRADOR is a nivelpermiso within the Organizador table.
            // So if role is ADMINISTRADOR, insert into Organizador with nivelPermiso 'ADMINISTRADOR'.


            await client.query('COMMIT');

            // Log user creation activity
            try {
                await pool.query(
                    'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                    [req.user.userId, 'CREACION_USUARIO', `Usuario creado: ${nombre} (ID: ${newUserId}, Rol: ${role})`, JSON.stringify({ createdUserId: newUserId, createdUserEmail: correoElectronico, role: role, nivelPermiso: nivelPermiso }), req.ip]
                );
            } catch (activityLogError) {
                console.error('Error logging activity for user creation:', activityLogError);
                // Continue with user creation success even if activity logging fails
            }

            res.status(201).json({ message: 'User created successfully', userId: newUserId });

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Transaction error during user creation:', e);
            if (e.code === '23505') { // Unique violation error code for email
                res.status(409).json({ message: 'Email already registered' });
            } else if (e.code === '23503') { // Foreign key violation (less likely here but for completeness) or invalid enum
                 // Could be an invalid ENUM value not caught by basic validation
                 res.status(400).json({ message: 'Invalid data provided (e.g., state, role, nivelPermiso).' });
            }
            else {
                res.status(500).json({ message: 'Error creating user' });
            }

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Server error during user creation:', error);
        res.status(500).json({ message: 'Server error during user creation' });
    }
});

router.put('/:id', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const userId = req.params.id;
    const { nombre, correoElectronico, contraseña, telefono, estado, role, nivelPermiso, departamento } = req.body; // Include departamento for Organizador

    // Refined Validations for user update
    if (nombre !== undefined && (typeof nombre !== 'string' || nombre.trim() === '')) {
        return res.status(400).json({ error: 'Si se proporciona el nombre, debe ser una cadena no vacía.' });
    }
    if (correoElectronico !== undefined && (typeof correoElectronico !== 'string' || !/\S+@\S+\.\S+/.test(correoElectronico))) {
        return res.status(400).json({ error: 'Si se proporciona el email, debe tener un formato válido.' });
    }
    if (telefono !== undefined && (typeof telefono !== 'string' || telefono.length > 10)) {
        return res.status(400).json({ error: 'El teléfono debe ser una cadena de máximo 10 caracteres.' });
    }
    if (estado !== undefined && (typeof estado !== 'string' || !['ACTIVO', 'INACTIVO', 'BLOQUEADO', 'PENDIENTE'].includes(estado))) {
        return res.status(400).json({ error: 'El estado debe ser uno de: ACTIVO, INACTIVO, BLOQUEADO, PENDIENTE.' });
    }
    if (role !== undefined && (typeof role !== 'string' || !['ASISTENTE', 'ORGANIZADOR', 'ADMINISTRADOR'].includes(role))) {
        return res.status(400).json({ error: 'El rol debe ser uno de: ASISTENTE, ORGANIZADOR, ADMINISTRADOR.' });
    }
    if (nivelPermiso !== undefined && (typeof nivelPermiso !== 'string' || !['ADMINISTRADOR', 'ORGANIZADOR'].includes(nivelPermiso))) {
        return res.status(400).json({ error: 'El nivel de permiso debe ser uno de: ADMINISTRADOR, ORGANIZADOR.' });
    }
    if (departamento !== undefined && (typeof departamento !== 'string' || departamento.length > 50)) {
        return res.status(400).json({ error: 'El departamento debe ser una cadena de máximo 50 caracteres.' });
    }

    try {
        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Fetch current user and role information to handle role changes
            const currentUserQuery = await client.query(
                 'SELECT u.usuarioID, \n'
                + 'CASE WHEN a.usuarioID IS NOT NULL THEN \'ASISTENTE\' \n'
                + 'WHEN o.usuarioID IS NOT NULL THEN \'ORGANIZADOR\' \n'
                + 'ELSE NULL END as role \n'
                + 'FROM Usuario u \n'
                + 'LEFT JOIN Asistente a ON u.usuarioID = a.usuarioID \n'
                + 'LEFT JOIN Organizador o ON u.usuarioID = o.usuarioID \n'
                + 'WHERE u.usuarioID = $1',
                [userId]
            );
            const currentUser = currentUserQuery.rows[0];

            if (!currentUser) {
                 await client.query('ROLLBACK');
                 client.release();
                 return res.status(404).json({ message: 'User not found.' });
            }

            const currentRole = currentUser.role;
            const targetRole = role !== null ? role : currentRole; // Use new role if provided, otherwise keep current

            // Update Usuario table
            const updateUsuarioQuery = [];
            const queryParams = [];
            let paramIndex = 1;

            if (nombre !== undefined) {
                updateUsuarioQuery.push(`nombre = $${paramIndex}`);
                queryParams.push(nombre);
                paramIndex++;
            }
            if (correoElectronico !== undefined) {
                updateUsuarioQuery.push(`correoElectronico = $${paramIndex}`);
                queryParams.push(correoElectronico);
                paramIndex++;
            }
            if (telefono !== undefined) {
                updateUsuarioQuery.push(`telefono = $${paramIndex}`);
                queryParams.push(telefono);
                paramIndex++;
            }
            if (estado !== undefined) {
                updateUsuarioQuery.push(`estado = $${paramIndex}`);
                queryParams.push(estado);
                paramIndex++;
            }
            if (contraseña !== undefined) {
                updateUsuarioQuery.push(`contraseñaHash = $${paramIndex}`);
                queryParams.push(await bcrypt.hash(contraseña, 10));
                paramIndex++;
            }

            if (updateUsuarioQuery.length > 0) {
                 // Add fechaModificacion update
                 updateUsuarioQuery.push(`fechaModificacion = NOW()`);
                 // No need to add to queryParams as NOW() is a function

                const queryText = `UPDATE Usuario SET ${updateUsuarioQuery.join(', ')} WHERE usuarioID = $${paramIndex} RETURNING usuarioID`;
                queryParams.push(userId);

                const updateResult = await client.query(queryText, queryParams);
                 if(updateResult.rows.length === 0) { // Should not happen if currentUserQuery found the user, but safety check
                      await client.query('ROLLBACK');
                      client.release();
                      return res.status(404).json({ message: 'User not found during update.' });
                 }
            }
             // If no fields in updateFields, only potential role change or no changes to Usuario table.

            // Handle role changes
            if (targetRole !== null && targetRole !== currentRole) {
                // Remove from old role table
                if (currentRole === 'ASISTENTE') {
                    await client.query('DELETE FROM Asistente WHERE usuarioID = $1', [userId]);
                } else if (currentRole === 'ORGANIZADOR' || currentRole === 'ADMINISTRADOR') {
                    // Note: This will also delete ADMINISTRATOR roles as they are in the Organizador table.
                    await client.query('DELETE FROM Organizador WHERE usuarioID = $1', [userId]);
                }

                // Insert into new role table
                if (targetRole === 'ASISTENTE') {
                    await client.query('INSERT INTO Asistente(usuarioID) VALUES($1)', [userId]);
                } else if (targetRole === 'ORGANIZADOR' || targetRole === 'ADMINISTRADOR') {
                     // Re-insert into Organizador with potentially new nivelPermiso and department
                    await client.query('INSERT INTO Organizador(usuarioID, departamento, nivelPermiso) VALUES($1, $2, $3)', [userId, departamento, nivelPermiso.toUpperCase()]);
                }
            } else if (targetRole !== null && (targetRole === 'ORGANIZADOR' || targetRole === 'ADMINISTRADOR') && (nivelPermiso !== undefined || departamento !== undefined)) {
                // If role is not changing, but it's an ORGANIZADOR/ADMINISTRADOR and nivelPermiso/department is provided, update Organizador table
                const updateOrganizerQuery = [];
                const organizerQueryParams = [userId];
                let orgParamIndex = 1;

                if(departamento !== undefined) {
                     updateOrganizerQuery.push(`departamento = $${orgParamIndex + 1}`);
                     organizerQueryParams.push(departamento);
                     orgParamIndex++;
                }
                if(nivelPermiso !== undefined) {
                    const validPermisos = ['ADMINISTRADOR', 'ORGANIZADOR'];
                    if (!validPermisos.includes(nivelPermiso.toUpperCase())) {
                        await client.query('ROLLBACK');
                        client.release();
                         return res.status(400).json({ message: 'Invalid nivelPermiso for update.' });
                    }
                     if (targetRole === 'ADMINISTRADOR' && nivelPermiso.toUpperCase() !== 'ADMINISTRADOR') {
                         await client.query('ROLLBACK');
                         client.release();
                          return res.status(400).json({ message: 'nivelPermiso must be ADMINISTRADOR for ADMINISTRADOR role.' });
                      }
                     updateOrganizerQuery.push(`nivelPermiso = $${orgParamIndex + 1}`);
                     organizerQueryParams.push(nivelPermiso.toUpperCase());
                     orgParamIndex++;
                }

                if(updateOrganizerQuery.length > 0) {
                     const orgQueryText = `UPDATE Organizador SET ${updateOrganizerQuery.join(', ')} WHERE usuarioID = $1`;
                     await client.query(orgQueryText, organizerQueryParams);
                }
            }


            await client.query('COMMIT');

            // Log user update activity
            try {
                await pool.query(
                    'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                    [req.user.userId, 'MODIFICACION_USUARIO', `Usuario modificado (ID: ${userId})`, JSON.stringify({ modifiedUserId: userId, updatedFields: req.body }), req.ip]
                );
            } catch (activityLogError) {
                console.error('Error logging activity for user update:', activityLogError);
                // Continue with user update success even if activity logging fails
            }

            res.status(200).json({ message: 'User updated successfully' });

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Transaction error during user update:', e);
             if (e.code === '23505') { // Unique violation error code for email
                 res.status(409).json({ message: 'Email already registered' });
            } else if (e.code === '23503') { // Foreign key violation or invalid enum
                 res.status(400).json({ message: 'Invalid data provided (e.g., state, role, nivelPermiso, foreign key).' });
            }
            else {
                res.status(500).json({ message: 'Error updating user' });
            }
        } finally {
            client.release();
        }

    } catch (error) {
        console.error(`Server error during user update with ID ${userId}:`, error);
        res.status(500).json({ message: `Server error during user update with ID ${userId}` });
    }
});

router.delete('/:id', authenticateToken, authorizeRoles(['ADMINISTRADOR']), async (req, res) => {
    const userId = req.params.id;

    // Refined Validation: Check if user exists before attempting deletion
    try {
        const userCheckResult = await pool.query('SELECT usuarioID FROM Usuario WHERE usuarioID = $1', [userId]);
        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Proceed with deletion if user exists
        // Delete user from Usuario table
        // Due to ON DELETE CASCADE, related entries in Asistente, Organizador, Pago, Boleto, Notificacion, Actividad, Reporte will also be deleted.
        const result = await pool.query(
            'DELETE FROM Usuario WHERE usuarioID = $1 RETURNING usuarioID',
            [userId]
        );

        if (result.rows.length > 0) {
            // Log user deletion activity
            try {
                // Using type 'OTRO' as ELIMINACION_USUARIO is not in the ENUM yet.
                await pool.query(
                    'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, detalles, direccionIP) VALUES($1, $2, $3, NOW(), $4, $5)',
                    [req.user.userId, 'OTRO', `Usuario eliminado (ID: ${userId})`, JSON.stringify({ deletedUserId: userId }), req.ip]
                );
            } catch (activityLogError) {
                console.error('Error logging activity for user deletion:', activityLogError);
                // Continue with user deletion success even if activity logging fails
            }
            res.status(200).json({ message: 'User deleted successfully' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }

    } catch (error) {
        console.error(`Error deleting user with ID ${userId}:`, error);
        res.status(500).json({ message: `Error deleting user with ID ${userId}` });
    }
});

module.exports = router;
