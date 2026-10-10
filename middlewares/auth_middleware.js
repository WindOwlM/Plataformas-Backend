const supabase = require('../config/supabase');
const { createUserClient } = supabase;

const verificarAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Acceso denegado. Falta el token.' });
        }

        const token = authHeader.split(' ')[1];

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }

        let adminData = null;
        let adminError = null;

        const serviceLookup = await supabase
            .from('administrador')
            .select('nombre, rol')
            .eq('id', authData.user.id)
            .maybeSingle();

        adminData = serviceLookup.data;
        adminError = serviceLookup.error;

        if (!adminData) {
            const userClient = createUserClient(token);
            const userLookup = await userClient
                .from('administrador')
                .select('nombre, rol')
                .eq('id', authData.user.id)
                .maybeSingle();

            adminData = userLookup.data;
            adminError = userLookup.error || adminError;
        }

        if (!adminData) {
            console.error('Admin lookup failed:', {
                userId: authData.user.id,
                code: adminError?.code,
                message: adminError?.message,
                details: adminError?.details,
                hint: adminError?.hint,
            });
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos de administrador.' });
        }

        req.usuarioAuth = {
            id: authData.user.id,
            nombre: adminData.nombre,
            rol: adminData.rol,
        };

        next();
    } catch (error) {
        console.error('Error en middleware de auth:', error);
        res.status(500).json({ error: 'Error interno del servidor al verificar la identidad.' });
    }
};

module.exports = verificarAdmin;
