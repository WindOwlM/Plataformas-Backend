// Archivo: middlewares/auth.middleware.js
const supabase = require('../config/supabase');

const verificarAdmin = async (req, res, next) => {
    try {
        // 1. Buscar el token en los headers de la petición
        // El frontend debe enviarlo como "Bearer eyJhbGciOiJIUzI1..."
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Acceso denegado. Falta el token.' });
        }

        // 2. Extraer solo el texto del token (quitando la palabra "Bearer ")
        const token = authHeader.split(' ')[1];

        // 3. Pedirle a Supabase que valide este token
        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }

        // 4. (Seguridad extra) Verificar que este usuario esté en tu tabla de administradores
        const { data: adminData, error: adminError } = await supabase
            .from('administrador')
            .select('rol')
            .eq('id', authData.user.id)
            .single(); // single() porque solo debería haber 1 admin con ese ID

        if (adminError || !adminData) {
            return res.status(403).json({ error: 'Acceso denegado. No tienes permisos de administrador.' });
        }

        // 5. Si todo está perfecto, guardamos los datos del admin en la petición
        // para que el controlador sepa quién hizo la acción (si lo llegara a necesitar)
        req.usuarioAuth = {
            id: authData.user.id,
            rol: adminData.rol
        };

        // 6. ¡CRUCIAL! next() le dice a Express: "Todo en orden, puedes continuar al controlador"
        next();

    } catch (error) {
        console.error("Error en middleware de auth:", error);
        res.status(500).json({ error: 'Error interno del servidor al verificar la identidad.' });
    }
};

module.exports = verificarAdmin;