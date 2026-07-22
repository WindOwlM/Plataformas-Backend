// Archivo: routes/cuentas.routes.js
const express = require('express');
const router = express.Router();

const cuentasController = require('../controllers/cuentas.controller.js');
const verificarAdmin = require('../middlewares/auth.middleware.js'); // <-- Importamos al guardia

// Fíjate en el orden: Ruta -> Middleware -> Controlador
// Puedes leerlo como: "Al intentar crear, primero verifica al admin, y si pasa, ejecuta crearCuenta"
router.post('/crear', verificarAdmin, cuentasController.crearCuenta);

// Si en el futuro tienes una ruta pública que no requiere login, 
// simplemente no le pones el middleware:
// router.get('/catalogo-publico', cuentasController.obtenerCatalogo);

module.exports = router;