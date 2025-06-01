// Middleware for role-based authorization
function authorizeRoles(roles) {
    return (req, res, next) => {
        // req.user is populated by the authenticateToken middleware
        if (!req.user || !req.user.role) {
            // Should not happen if authenticateToken is used before this middleware,
            // but as a safeguard.
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Check if the user's role is included in the allowed roles array
        const userRole = req.user.role.toUpperCase();
        const allowedRoles = roles.map(role => role.toUpperCase());

        // For ORGANIZADOR and ADMINISTRADOR roles stored in Organizador table,
        // we might also need to check nivelPermiso if the logic depends on it.
        // However, the plan mentions authorization by 'role'. Let's stick to the Usuario role first.
        // Note: ADMINISTRADOR role is effectively a nivelPermiso within the ORGANIZADOR table entry according to schema.
        // We should check req.user.role AND potentially req.user.nivelPermiso depending on the route requirement.
        // For /api/users (Admin Management), let's check if the user is either a Usuario with an 'ADMINISTRADOR' entry in Organizador.
        // The login query currently gets 'role' and 'nivelPermiso'. Let's use 'role' first for simplicity as it's derived.

        if (allowedRoles.includes(userRole)) {
            // User has an allowed role, proceed
            next();
        } else {
            // User role is not allowed
            res.status(403).json({ message: 'Forbidden: You do not have the required role to access this resource.' });
        }
    };
}

module.exports = authorizeRoles;
