const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Importar todas las rutas
const cuentasRoutes = require('./routes/cuentas.routes.js');
const catalogosRoutes = require('./routes/catalogos.routes.js');
const clientesRoutes = require('./routes/clientes.routes.js');
const ventasRoutes = require('./routes/ventas.routes.js');

const app = express();

app.use(cors()); 
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