-- Drop existing tables and types if they exist (to allow re-running the script)
-- Note: This will delete all existing data!
DROP TABLE IF EXISTS AreaManager CASCADE;
DROP TABLE IF EXISTS Reporte CASCADE;
DROP TABLE IF EXISTS Actividad CASCADE;
DROP TABLE IF EXISTS Notificacion CASCADE;
DROP TABLE IF EXISTS Croquis CASCADE;
DROP TABLE IF EXISTS Boleto CASCADE;
DROP TABLE IF EXISTS Pago CASCADE;
DROP TABLE IF EXISTS Asiento CASCADE;
DROP TABLE IF EXISTS Area CASCADE;
DROP TABLE IF EXISTS Evento CASCADE;
DROP TABLE IF EXISTS Organizador CASCADE;
DROP TABLE IF EXISTS Asistente CASCADE;
DROP TABLE IF EXISTS Usuario CASCADE;
DROP TABLE IF EXISTS Lugar CASCADE;
DROP TABLE IF EXISTS MetodoPago CASCADE;
DROP TABLE IF EXISTS Configuracion CASCADE;
-- Add any other tables here if you add them later

-- Drop sequences created by SERIAL types
DROP SEQUENCE IF EXISTS usuario_usuarioid_seq CASCADE;
DROP SEQUENCE IF EXISTS lugar_lugarid_seq CASCADE;
DROP SEQUENCE IF EXISTS evento_eventoid_seq CASCADE;
DROP SEQUENCE IF EXISTS area_areaid_seq CASCADE;
DROP SEQUENCE IF EXISTS asiento_asientoid_seq CASCADE;
DROP SEQUENCE IF EXISTS metodopago_metodopagoid_seq CASCADE;
DROP SEQUENCE IF EXISTS pago_pagoid_seq CASCADE;
DROP SEQUENCE IF EXISTS boleto_boletid_seq CASCADE;
DROP SEQUENCE IF EXISTS croquis_croquisid_seq CASCADE;
DROP SEQUENCE IF EXISTS notificacion_notificacionid_seq CASCADE;
DROP SEQUENCE IF EXISTS actividad_actividadid_seq CASCADE;
DROP SEQUENCE IF EXISTS reporte_reportid_seq CASCADE;
DROP SEQUENCE IF EXISTS areamanager_areamanagerid_seq CASCADE;


-- Drop ENUM types
DROP TYPE IF EXISTS nivelpermiso;
DROP TYPE IF EXISTS estado_usuario;
DROP TYPE IF EXISTS tipo_area;
DROP TYPE IF EXISTS estado_asiento;
DROP TYPE IF EXISTS estado_evento;
DROP TYPE IF EXISTS tipo_evento;
DROP TYPE IF EXISTS estado_pago;
DROP TYPE IF EXISTS estado_boleto;
DROP TYPE IF EXISTS tipo_notificacion;
DROP TYPE IF EXISTS tipo_actividad;
DROP TYPE IF EXISTS tipo_reporte;
DROP TYPE IF EXISTS formato_reporte;


-- Create ENUM types
CREATE TYPE nivelpermiso AS ENUM ('ADMINISTRADOR', 'ORGANIZADOR');
CREATE TYPE estado_usuario AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'PENDIENTE');
CREATE TYPE tipo_area AS ENUM ('GENERAL', 'VIP', 'ESCENARIO', 'RESERVADO');
CREATE TYPE estado_asiento AS ENUM ('DISPONIBLE', 'OCUPADO', 'RESERVADO', 'BLOQUEADO');
CREATE TYPE estado_evento AS ENUM ('ACTIVO', 'COMPLETADO', 'CANCELADO', 'BORRADOR');
CREATE TYPE tipo_evento AS ENUM ('CONFERENCIA', 'TALLER', 'CEREMONIA', 'SEMINARIO', 'OTRO');
CREATE TYPE estado_pago AS ENUM ('PENDIENTE', 'COMPLETADO', 'FALLIDO', 'REEMBOLSADO');
CREATE TYPE estado_boleto AS ENUM ('ACTIVO', 'USADO', 'CANCELADO', 'EXPIRADO');
CREATE TYPE tipo_notificacion AS ENUM ('CONFIRMACION_COMPRA', 'RECORDATORIO_EVENTO', 'CAMBIO_EVENTO', 'SISTEMA');
CREATE TYPE tipo_actividad AS ENUM ('INICIO_SESION', 'COMPRA', 'CREACION_EVENTO', 'MODIFICACION_EVENTO', 'VERIFICACION_ASISTENCIA', 'OTRO');
CREATE TYPE tipo_reporte AS ENUM ('OCUPACION', 'VENTAS', 'ASISTENCIA', 'PERSONAL');
CREATE TYPE formato_reporte AS ENUM ('PDF', 'EXCEL', 'CSV');


-- Create Tables

CREATE TABLE Usuario (
    usuarioID SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correoElectronico VARCHAR(100) NOT NULL UNIQUE,
    contraseñaHash VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    estado estado_usuario NOT NULL,
    ultimoAcceso TIMESTAMP,
    fechaCreacion TIMESTAMP NOT NULL,
    fechaModificacion TIMESTAMP NOT NULL
);

CREATE TABLE Organizador (
    usuarioID INT PRIMARY KEY,
    departamento VARCHAR(50),
    nivelPermiso nivelpermiso NOT NULL
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Asistente (
    usuarioID INT PRIMARY KEY,
    numeroEstudiante VARCHAR(20), -- Assuming numeroEstudiante can be optional or not applicable to all attendees
    boletosComprados INT DEFAULT 0 NOT NULL
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Lugar (
    lugarID SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    capacidadMaxima INT NOT NULL,
    descripcion TEXT
);

CREATE TABLE Evento (
    eventoID SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    fecha DATE NOT NULL,
    horaInicio TIME NOT NULL,
    horaFin TIME NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    capacidad INT NOT NULL,
    boletosVendidos INT DEFAULT 0 NOT NULL,
    estado estado_evento NOT NULL,
    imagen VARCHAR(255), -- Assuming image is a path or URL
    tipo tipo_evento NOT NULL,
    fechaCreacion TIMESTAMP NOT NULL,
    fechaModificacion TIMESTAMP NOT NULL,
    lugarID INT NOT NULL,
    organizadorID INT NOT NULL
    -- FOREIGN KEY (lugarID) REFERENCES Lugar(lugarID) ON DELETE CASCADE -- Added later
    -- FOREIGN KEY (organizadorID) REFERENCES Organizador(usuarioID) ON DELETE SET NULL -- Added later
);

CREATE TABLE Area (
    areaID SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    capacidad INT NOT NULL,
    tipo tipo_area NOT NULL,
    lugarID INT NOT NULL
    -- FOREIGN KEY (lugarID) REFERENCES Lugar(lugarID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Asiento (
    asientoID SERIAL PRIMARY KEY,
    codigo VARCHAR(20), -- e.g., 'A1', 'mesa-1-silla-5'
    fila INT,
    columna INT,
    estado estado_asiento NOT NULL,
    areaID INT NOT NULL
    -- FOREIGN KEY (areaID) REFERENCES Area(areaID) ON DELETE CASCADE -- Added later
);


CREATE TABLE MetodoPago (
    metodoPagoID SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Pago (
    pagoID SERIAL PRIMARY KEY,
    monto DECIMAL(10,2) NOT NULL,
    fechaPago TIMESTAMP NOT NULL,
    metodoPagoID INT NOT NULL,
    referencia VARCHAR(100), -- Transaction ID, bank reference, etc.
    estado estado_pago NOT NULL,
    usuarioID INT NOT NULL, -- Who made the payment
    eventoID INT NOT NULL -- For which event was the payment made?
    -- FOREIGN KEY (metodoPagoID) REFERENCES MetodoPago(metodoPagoID) ON DELETE RESTRICT -- Added later
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
    -- FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Boleto (
    boletoID SERIAL PRIMARY KEY,
    fechaCompra TIMESTAMP NOT NULL,
    codigoQR VARCHAR(255) UNIQUE NOT NULL, -- Store the QR code identifier/data
    estado estado_boleto NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    pagoID INT NOT NULL, -- Which payment does this ticket belong to?
    asientoID INT, -- Which seat is assigned (if applicable)
    eventoID INT NOT NULL, -- Which event is this ticket for?
    usuarioID INT NOT NULL -- Who is the ticket for? (Could be different from who paid)
    -- FOREIGN KEY (pagoID) REFERENCES Pago(pagoID) ON DELETE CASCADE -- Added later
    -- FOREIGN KEY (asientoID) REFERENCES Asiento(asientoID) ON DELETE SET NULL -- Added later
    -- FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE -- Added later
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
);


CREATE TABLE Croquis (
    croquisID SERIAL PRIMARY KEY,
    eventoID INT UNIQUE NOT NULL, -- One croquis per event
    configuracion JSON, -- Store the layout configuration
    fechaCreacion TIMESTAMP NOT NULL,
    fechaModificacion TIMESTAMP NOT NULL
    -- FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Notificacion (
    notificacionID SERIAL PRIMARY KEY,
    usuarioID INT NOT NULL,
    titulo VARCHAR(100) NOT NULL,
    mensaje TEXT NOT NULL,
    tipo tipo_notificacion NOT NULL,
    fecha TIMESTAMP NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
);

CREATE TABLE Actividad (
    actividadID SERIAL PRIMARY KEY,
    usuarioID INT, -- NULL if system activity
    tipo tipo_actividad NOT NULL,
    descripcion VARCHAR(100) NOT NULL,
    detalles TEXT,
    fecha TIMESTAMP NOT NULL,
    direccionIP VARCHAR(45) -- IPv4 or IPv6
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE SET NULL -- Added later
);

CREATE TABLE Reporte (
    reporteID SERIAL PRIMARY KEY,
    usuarioID INT NOT NULL, -- Who generated the report
    tipo tipo_reporte NOT NULL,
    fechaGeneracion TIMESTAMP NOT NULL,
    parametros TEXT, -- e.g., JSON or text of report filters/parameters
    resultado TEXT, -- e.g., path to generated file or summary text
    formato formato_reporte NOT NULL
    -- FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE -- Added later
);

-- Table for assigning a manager to an area/table (implied by requirement CDU5)
CREATE TABLE AreaManager (
    areaManagerID SERIAL PRIMARY KEY,
    areaID INT NOT NULL,
    organizadorID INT NOT NULL, -- The organizer assigned to this area/table
    eventoID INT NOT NULL, -- For which event is this assignment?
    UNIQUE (areaID, eventoID) -- An area can only have one manager per event
);

-- Tabla de Configuración General
CREATE TABLE Configuracion (
    configID SERIAL PRIMARY KEY,
    nombreAplicacion VARCHAR(255) NOT NULL,
    contactoEmail VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    -- Puedes añadir más campos según sea necesario para la configuración
    fechaCreacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Add Foreign Keys (Separated for clarity and to handle potential dependencies)

ALTER TABLE Organizador
ADD CONSTRAINT fk_organizador_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE;

ALTER TABLE Asistente
ADD CONSTRAINT fk_asistente_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE;

ALTER TABLE Evento
ADD CONSTRAINT fk_evento_lugar
FOREIGN KEY (lugarID) REFERENCES Lugar(lugarID) ON DELETE CASCADE;

ALTER TABLE Evento
ADD CONSTRAINT fk_evento_organizador
FOREIGN KEY (organizadorID) REFERENCES Organizador(usuarioID) ON DELETE SET NULL; -- If organizer is removed, event remains but organizer link is null

ALTER TABLE Area
ADD CONSTRAINT fk_area_lugar
FOREIGN KEY (lugarID) REFERENCES Lugar(lugarID) ON DELETE CASCADE;

ALTER TABLE Asiento
ADD CONSTRAINT fk_asiento_area
FOREIGN KEY (areaID) REFERENCES Area(areaID) ON DELETE CASCADE;

ALTER TABLE Pago
ADD CONSTRAINT fk_pago_metodopago
FOREIGN KEY (metodoPagoID) REFERENCES MetodoPago(metodoPagoID) ON DELETE RESTRICT; -- Prevent deleting method if payments exist

ALTER TABLE Pago
ADD CONSTRAINT fk_pago_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE;

ALTER TABLE Pago
ADD CONSTRAINT fk_pago_evento
FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE;

ALTER TABLE Boleto
ADD CONSTRAINT fk_boleto_pago
FOREIGN KEY (pagoID) REFERENCES Pago(pagoID) ON DELETE CASCADE;

ALTER TABLE Boleto
ADD CONSTRAINT fk_boleto_asiento
FOREIGN KEY (asientoID) REFERENCES Asiento(asientoID) ON DELETE SET NULL; -- If seat is removed, ticket remains but seat link is null

ALTER TABLE Boleto
ADD CONSTRAINT fk_boleto_evento
FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE;

ALTER TABLE Boleto
ADD CONSTRAINT fk_boleto_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE; -- User who will use the ticket

ALTER TABLE Croquis
ADD CONSTRAINT fk_croquis_evento
FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE;

ALTER TABLE Notificacion
ADD CONSTRAINT fk_notificacion_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE;

ALTER TABLE Actividad
ADD CONSTRAINT fk_actividad_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE SET NULL; -- If user is removed, activity remains but user link is null

ALTER TABLE Reporte
ADD CONSTRAINT fk_reporte_usuario
FOREIGN KEY (usuarioID) REFERENCES Usuario(usuarioID) ON DELETE CASCADE;

ALTER TABLE AreaManager
ADD CONSTRAINT fk_areamanager_area
FOREIGN KEY (areaID) REFERENCES Area(areaID) ON DELETE CASCADE;

ALTER TABLE AreaManager
ADD CONSTRAINT fk_areamanager_organizador
FOREIGN KEY (organizadorID) REFERENCES Organizador(usuarioID) ON DELETE RESTRICT; -- Prevent deleting organizer if they manage an area

ALTER TABLE AreaManager
ADD CONSTRAINT fk_areamanager_evento
FOREIGN KEY (eventoID) REFERENCES Evento(eventoID) ON DELETE CASCADE;

-- Create Indexes (Based on schema diagram and common query patterns)

-- Indexes indicated in the diagram
CREATE INDEX idx_usuario_correo ON Usuario (correoElectronico);
CREATE INDEX idx_organizador_departamento ON Organizador (departamento); -- Assumed based on common queries
CREATE INDEX idx_asistente_numeroestudiante ON Asistente (numeroEstudiante); -- Assumed
CREATE INDEX idx_evento_fecha ON Evento (fecha); -- Frequent filtering by date
CREATE INDEX idx_evento_lugar ON Evento (lugarID); -- Joins with Lugar
CREATE INDEX idx_evento_organizador ON Evento (organizadorID); -- Joins with Organizador
CREATE INDEX idx_area_lugar ON Area (lugarID); -- Joins with Lugar
CREATE INDEX idx_asiento_area ON Asiento (areaID); -- Joins with Area
CREATE INDEX idx_pago_fecha ON Pago (fechaPago); -- Filtering by date
CREATE INDEX idx_pago_usuario ON Pago (usuarioID); -- Joins with Usuario
CREATE INDEX idx_pago_evento ON Pago (eventoID); -- Joins with Evento
CREATE INDEX idx_pago_metodopago ON Pago (metodoPagoID); -- Joins with MetodoPago
CREATE INDEX idx_boleto_codigoqr ON Boleto (codigoQR); -- Frequent lookup by QR code
CREATE INDEX idx_boleto_pago ON Boleto (pagoID); -- Joins with Pago
CREATE INDEX idx_boleto_asiento ON Boleto (asientoID); -- Joins with Asiento
CREATE INDEX idx_boleto_evento ON Boleto (eventoID); -- Joins with Evento
CREATE INDEX idx_boleto_usuario ON Boleto (usuarioID); -- Joins with Usuario
CREATE INDEX idx_croquis_evento ON Croquis (eventoID); -- Joins with Evento
CREATE INDEX idx_notificacion_usuario ON Notificacion (usuarioID); -- Joins with Usuario
CREATE INDEX idx_actividad_usuario ON Actividad (usuarioID); -- Joins with Usuario
CREATE INDEX idx_reporte_usuario ON Reporte (usuarioID); -- Joins with Usuario
CREATE INDEX idx_reporte_fecha ON Reporte (fechaGeneracion); -- Filtering by date
CREATE INDEX idx_areamanager_area ON AreaManager (areaID); -- Joins with Area
CREATE INDEX idx_areamanager_organizador ON AreaManager (organizadorID); -- Joins with Organizador
CREATE INDEX idx_areamanager_evento ON AreaManager (eventoID); -- Joins with Evento


-- Add Comments to tables and columns (Optional but good practice)
COMMENT ON TABLE Usuario IS 'Stores user information including authentication details.';
COMMENT ON TABLE Organizador IS 'Stores information specific to users with Organizer role.';
COMMENT ON TABLE Asistente IS 'Stores information specific to users with Attendee role.';
COMMENT ON TABLE Lugar IS 'Stores information about event locations.';
COMMENT ON TABLE Evento IS 'Stores details about planned events.';
COMMENT ON TABLE Area IS 'Represents logical areas within a Lugar, like sections or tables.';
COMMENT ON TABLE Asiento IS 'Represents individual seats or spots within an Area.';
COMMENT ON TABLE MetodoPago IS 'Stores available payment methods.';
COMMENT ON TABLE Pago IS 'Records payment transactions for event tickets.';
COMMENT ON TABLE Boleto IS 'Represents a purchased ticket for an event, linked to a payment and optionally a seat.';
COMMENT ON TABLE Croquis IS 'Stores the layout configuration (e.g., seating arrangement) for an event.';
COMMENT ON TABLE Notificacion IS 'Stores system notifications sent to users.';
COMMENT ON TABLE Actividad IS 'Logs user and system activities.';
COMMENT ON TABLE Reporte IS 'Stores information about generated reports.';
COMMENT ON TABLE AreaManager IS 'Assigns an Organizer as a manager to a specific Area within an Event.';
COMMENT ON TABLE Configuracion IS 'Stores general application configuration settings.';

COMMENT ON COLUMN Usuario.correoElectronico IS 'Unique email address for user login.';
COMMENT ON COLUMN Usuario.contraseñaHash IS 'Hashed password for security.';
COMMENT ON COLUMN Evento.imagen IS 'Path or URL to the event image.';
COMMENT ON COLUMN Pago.referencia IS 'Transaction ID or external reference for the payment.';
COMMENT ON COLUMN Boleto.codigoQR IS 'Unique identifier or data stored in the QR code for attendance validation.';
COMMENT ON COLUMN Croquis.configuracion IS 'JSON data representing the visual layout of the event space (tables, seats, etc.).';
COMMENT ON COLUMN Actividad.usuarioID IS 'Links to the user who performed the activity, can be NULL for system activities.';
COMMENT ON COLUMN Actividad.direccionIP IS 'IP address from where the activity originated.';
COMMENT ON COLUMN Reporte.parametros IS 'Parameters used to generate the report (e.g., filters, date ranges).';
COMMENT ON COLUMN Reporte.resultado IS 'Result of the report generation, e.g., file path or summary.';
COMMENT ON COLUMN Configuracion.nombreAplicacion IS 'Name of the application.';
COMMENT ON COLUMN Configuracion.contactoEmail IS 'Contact email for support or inquiries.';

-- Add CHECK constraints for data integrity
ALTER TABLE Evento
ADD CONSTRAINT check_evento_precio_no_negativo CHECK (precio >= 0),
ADD CONSTRAINT check_evento_capacidad_positiva CHECK (capacidad > 0),
ADD CONSTRAINT check_evento_boletos_vendidos_no_negativos CHECK (boletosVendidos >= 0);

ALTER TABLE Asistente
ADD CONSTRAINT check_asistente_boletos_comprados_no_negativos CHECK (boletosComprados >= 0);

-- New CHECK constraints
ALTER TABLE Area
ADD CONSTRAINT check_area_capacidad_positiva CHECK (capacidad > 0);

ALTER TABLE Pago
ADD CONSTRAINT check_pago_monto_no_negativo CHECK (monto >= 0);

ALTER TABLE Boleto
ADD CONSTRAINT check_boleto_precio_no_negativo CHECK (precio >= 0);

-- Function to update fechaModificacion
CREATE OR REPLACE FUNCTION update_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fechaModificacion = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to set fechaCreacion
CREATE OR REPLACE FUNCTION set_fecha_creacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fechaCreacion = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for Usuario table
CREATE OR REPLACE TRIGGER trigger_usuario_fecha_modificacion
BEFORE UPDATE ON Usuario
FOR EACH ROW
EXECUTE FUNCTION update_fecha_modificacion();

-- Trigger for Usuario table (fechaCreacion)
CREATE OR REPLACE TRIGGER trigger_usuario_fecha_creacion
BEFORE INSERT ON Usuario
FOR EACH ROW
EXECUTE FUNCTION set_fecha_creacion();

-- Trigger for Evento table
CREATE OR REPLACE TRIGGER trigger_evento_fecha_modificacion
BEFORE UPDATE ON Evento
FOR EACH ROW
EXECUTE FUNCTION update_fecha_modificacion();

-- Trigger for Evento table (fechaCreacion)
CREATE OR REPLACE TRIGGER trigger_evento_fecha_creacion
BEFORE INSERT ON Evento
FOR EACH ROW
EXECUTE FUNCTION set_fecha_creacion();

-- Trigger for Croquis table
CREATE OR REPLACE TRIGGER trigger_croquis_fecha_modificacion
BEFORE UPDATE ON Croquis
FOR EACH ROW
EXECUTE FUNCTION update_fecha_modificacion();

-- Trigger for Croquis table (fechaCreacion)
CREATE OR REPLACE TRIGGER trigger_croquis_fecha_creacion
BEFORE INSERT ON Croquis
FOR EACH ROW
EXECUTE FUNCTION set_fecha_creacion();

-- Trigger for Notificacion table (fechaCreacion)
-- Note: Notificacion only has fecha, not fechaCreacion. Skipping trigger for this table column.
-- Leaving this comment here to reflect the check I did.

-- Trigger for Actividad table (fecha)
-- Note: Actividad has fecha, but not fechaCreacion/fechaModificacion. The timestamp IS the creation time. No trigger needed for this table column.
-- Leaving this comment here to reflect the check I did.

-- Trigger for Reporte table (fechaGeneracion)
-- Note: Reporte has fechaGeneracion, but not fechaCreacion/fechaModificacion. The timestamp IS the generation time. No trigger needed for this table column.
-- Leaving this comment here to reflect the check I did.

-- AreaManager, Lugar, Area, Asiento, Pago, Boleto tables do not have fechaCreacion or fechaModificacion columns.
-- No triggers for automatic date management are needed for these tables based on the current schema.

-- You can add similar triggers for other tables as needed (Evento, Lugar, Area, Asiento, Pago, Boleto, etc.)
-- The existing triggers cover the tables with explicit fechaModificacion columns.
-- The new triggers below cover tables with explicit fechaCreacion columns.

-- Disparador para actualizar fechaModificacion en la tabla Configuracion
CREATE OR REPLACE FUNCTION update_configuracion_modificacion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fechaModificacion = NOW();
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER update_configuracion_modificacion_timestamp
BEFORE UPDATE ON Configuracion
FOR EACH ROW
EXECUTE FUNCTION update_configuracion_modificacion_timestamp(); 