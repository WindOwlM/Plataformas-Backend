const express = require('express');
const cors = require('cors');
require('dotenv').config();
const supabase = require('./config/supabase');
const { registrarErroresHttp, manejadorErrores, registrarErroresProceso } = require('./lib/logger');
const { origenPermitido } = require('./lib/origenes');

registrarErroresProceso();

// Importar todas las rutas
const cuentasRoutes = require('./routes/cuentas_routes.js');
const catalogosRoutes = require('./routes/catalogos_routes.js');
const clientesRoutes = require('./routes/clientes_routes.js');
const meRoutes = require('./routes/me_routes.js');
const porUbicarRoutes = require('./routes/por_ubicar_routes.js');
const correosRoutes = require('./routes/correos_routes.js');
const reportesRoutes = require('./routes/reportes_routes.js');

const app = express();

app.use(cors({
    origin: function(origin, callback) {
        if (origenPermitido(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); 
app.use(registrarErroresHttp);

// Registrar las Rutas
app.use('/api/cuentas', cuentasRoutes);
app.use('/api/catalogos', catalogosRoutes); // Maneja /api/catalogos/plataformas y /proveedores
app.use('/api/clientes', clientesRoutes);
app.use('/api/me', meRoutes);
app.use('/api/por-ubicar', porUbicarRoutes);
app.use('/api/correos', correosRoutes);
app.use('/api/reportes', reportesRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use(manejadorErrores);

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"
app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} 🚀`);
});