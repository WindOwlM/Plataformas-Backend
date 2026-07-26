const supabase = require('../config/supabase');

const verificarAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        console.log('=== INICIO VERIFICACIÓN ===');
        console.log('Auth Header:', authHeader);

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ No hay header o no empieza con Bearer');
            return res.status(401).json({ error: 'Acceso denegado. Falta el token.' });
        }

        const token = authHeader.split(' ')[1];
        console.log('Token extraído (primeros 50 chars):', token.substring(0, 50));

        // Verificar que supabase esté configurado
        console.log('Supabase URL:', process.env.SUPABASE_URL);
        console.log('Supabase Key (primeros 20):', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20));

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        console.log('Auth Data:', authData);
        console.log('Auth Error:', authError);

        if (authError || !authData.user) {
            console.log('❌ Token inválido según Supabase');
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }

        console.log('✅ Usuario autenticado:', authData.user.id);

        const { data: adminData, error: adminError } = await supabase
            .from('administrador')
            .select('rol')
            .eq('id', authData.user.id)
            .single();

        console.log('Admin Data:', adminData);
        console.log('Admin Error:', adminError);

        if (adminError || !adminData) {
            console.log('❌ No encontrado en tabla administrador');
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos de administrador.' });
        }

        console.log('✅ Admin verificado:', adminData.rol);

        req.usuarioAuth = {
            id: authData.user.id,
            rol: adminData.rol
        };

        next();

    } catch (error) {
        console.error("❌ Error en middleware de auth:", error);
        res.status(500).json({ error: 'Error interno del servidor al verificar la identidad.' });
    }
};

module.exports = verificarAdmin;