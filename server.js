const express = require('express');
const cors = require('cors');
require('dotenv').config();
const supabase = require('./config/supabase');

// Importar todas las rutas
const cuentasRoutes = require('./routes/cuentas_routes.js');
const catalogosRoutes = require('./routes/catalogos_routes.js');
const clientesRoutes = require('./routes/clientes_routes.js');
const ventasRoutes = require('./routes/ventas_routes.js');

const app = express();

const origenesPermitidos = ['http://localhost:5173', 'https://plataformas-frontend.vercel.app']; // Cambia la URL por la real de Vercel

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || origenesPermitidos.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); 

// Registrar las Rutas
app.use('/api/cuentas', cuentasRoutes);
app.use('/api/catalogos', catalogosRoutes); // Maneja /api/catalogos/plataformas y /proveedores
app.use('/api/clientes', clientesRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/auth', require('./routes/auth.routes'));
app.use('/emails', require('./routes/email.routes'));
app.use('/outlook', require('./routes/outlook.routes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} 🚀`);
    console.log(`🔗 Autenticación: http://localhost:${PORT}/auth/google`);
});