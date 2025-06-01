const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db'); // Import the pool from db.js

// JWT Secret (Read from environment variable)
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    process.exit(1); // Exit the process if secret is not defined
}

// Authentication Routes
router.post('/register', async (req, res) => {
  const { nombre, correoElectronico, contraseña, telefono, role } = req.body;

  // Basic validation
  if (!nombre || !correoElectronico || !contraseña || !role) {
    return res.status(400).json({ message: 'Missing required fields: nombre, correoElectronico, contraseña, role' });
  }

  // Validate email format (basic regex)
  const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
  if (!emailRegex.test(correoElectronico)) {
      return res.status(400).json({ message: 'Invalid email format' });
  }

  // Validate role
  const validRoles = ['ASISTENTE', 'ORGANIZADOR']; // Assuming these are the roles registerable via this endpoint
  const allowedRolesForRegistration = ['ASISTENTE', 'ORGANIZADOR', 'ADMINISTRADOR']; // Temporarily allow ADMIN registration
  if (!allowedRolesForRegistration.includes(role.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid role specified. Must be ASISTENTE, ORGANIZADOR, or ADMINISTRADOR' });
  }

  try {
    // Check if user already exists
    const userCheck = await pool.query('SELECT usuarioID FROM Usuario WHERE correoElectronico = $1', [correoElectronico]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(contraseña, 10); // 10 is the salt rounds

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into Usuario table
      const userInsertResult = await client.query(
        'INSERT INTO Usuario(nombre, correoElectronico, contraseñaHash, telefono, estado, fechaCreacion, fechaModificacion) VALUES($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING usuarioID',
        [nombre, correoElectronico, hashedPassword, telefono, 'ACTIVO']
      );
      const newUserId = userInsertResult.rows[0].usuarioid; // Lowercase 'usuarioid' as returned by pg

      // Insert into appropriate role table (Asistente or Organizador)
      if (role.toUpperCase() === 'ASISTENTE') {
        await client.query('INSERT INTO Asistente(usuarioID) VALUES($1)', [newUserId]);
      } else if (role.toUpperCase() === 'ORGANIZADOR') {
          // For organizer, we need nivelPermiso. Assuming default is ORGANIZADOR for now, but ideally should be in request body or handled via admin interface.
          // For simplicity, hardcoding 'ORGANIZADOR' nivelPermiso. If department is needed, add it to request body.
          await client.query('INSERT INTO Organizador(usuarioID, nivelPermiso) VALUES($1, $2)', [newUserId, 'ORGANIZADOR']);
      }

      await client.query('COMMIT');

      res.status(201).json({ message: 'User registered successfully', userId: newUserId });

    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Transaction error during user registration:', e);
      // Check for specific duplicate key error if user check failed (less likely with the explicit check above, but good practice)
      if (e.code === '23505') { // Unique violation error code
          res.status(409).json({ message: 'Email already registered' });
      } else {
          res.status(500).json({ message: 'Error registering user' });
      }

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Server error during user registration:', error);
    res.status(500).json({ message: 'Server error during user registration' });
  }
});

router.post('/login', async (req, res) => {
    const { correoElectronico, contraseña } = req.body;

    // Basic validation
    if (!correoElectronico || !contraseña) {
        return res.status(400).json({ message: 'Missing required fields: correoElectronico, contraseña' });
    }

    try {
        // Find user by email
        const userQuery = await pool.query(
            'SELECT u.usuarioID, u.nombre, u.correoElectronico, u.contraseñaHash, u.estado, u.ultimoAcceso, '
            + 'CASE WHEN a.usuarioID IS NOT NULL THEN \'ASISTENTE\' '
            + 'WHEN o.usuarioID IS NOT NULL AND o.nivelPermiso = \'ADMINISTRADOR\' THEN \'ADMINISTRADOR\' '
            + 'WHEN o.usuarioID IS NOT NULL THEN \'ORGANIZADOR\' '
            + 'ELSE NULL END as role, o.nivelPermiso '
            + 'FROM Usuario u '
            + 'LEFT JOIN Asistente a ON u.usuarioID = a.usuarioID '
            + 'LEFT JOIN Organizador o ON u.usuarioID = o.usuarioID '
            + 'WHERE u.correoElectronico = $1',
            [correoElectronico]
        );

        const user = userQuery.rows[0];

        // Check if user exists and is active
        if (!user || user.estado !== 'ACTIVO') {
            return res.status(401).json({ message: 'Invalid credentials or user is not active' });
        }

        // Compare password
        const passwordMatch = await bcrypt.compare(contraseña, user['contraseñahash']); // Corrected key access to lowercase

        if (!passwordMatch) {
            // If password doesn't match
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Update last access timestamp
        await pool.query(
            'UPDATE Usuario SET ultimoAcceso = NOW() WHERE usuarioID = $1',
            [user.usuarioid] // Lowercase as returned by pg
        );

        // TODO: Implement JWT or session management for persistent login

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.usuarioid, role: user.role, nivelPermiso: user.nivelpermiso }, // Payload
            jwtSecret, // Secret key
            { expiresIn: '1h' } // Token expiration time (adjust as needed)
        );

        // Log login activity
        try {
            await pool.query(
                'INSERT INTO Actividad(usuarioID, tipo, descripcion, fecha, direccionIP) VALUES($1, $2, $3, NOW(), $4)',
                [user.usuarioid, 'INICIO_SESION', 'User logged in successfully', req.ip] // req.ip gets the client IP address
            );
        } catch (activityLogError) {
            console.error('Error logging activity for login:', activityLogError);
            // Continue with login success even if activity logging fails
        }

        // Return user information and JWT token
        const { contraseñaHash, ...userInfo } = user;
        res.status(200).json({ message: 'Login successful', user: userInfo, token: token });

    } catch (error) {
        console.error('Server error during user login:', error);
        res.status(500).json({ message: 'Server error during user login' });
    }
});

module.exports = router;
