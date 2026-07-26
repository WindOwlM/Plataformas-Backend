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

app.use(cors({
    origin: 'http://localhost:5173', // Puerto de Vite
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); 

// Registrar las Rutas
app.use('/api/cuentas', cuentasRoutes);
app.use('/api/catalogos', catalogosRoutes); // Maneja /api/catalogos/plataformas y /proveedores
app.use('/api/clientes', clientesRoutes);
app.use('/api/ventas', ventasRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} 🚀`);
});