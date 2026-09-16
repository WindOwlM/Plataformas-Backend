const express = require('express');
const cors = require('cors');
require('dotenv').config();
const supabase = require('./config/supabase');

// Importar todas las rutas
const cuentasRoutes = require('./routes/cuentas_routes.js');
const catalogosRoutes = require('./routes/catalogos_routes.js');
const clientesRoutes = require('./routes/clientes_routes.js');
const meRoutes = require('./routes/me_routes.js');

const app = express();

const origenesPermitidos = ['http://localhost:5173', 'https://plataformas-frontend.vercel.app']; 

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
app.use('/api/me', meRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"
app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} 🚀`);
});