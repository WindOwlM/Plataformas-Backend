const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogos.controller.js');
const verificarAdmin = require('../middlewares/auth.middleware.js');

// Todas protegidas con verificarAdmin
router.post('/plataformas', verificarAdmin, catalogosController.crearPlataforma);
router.get('/plataformas', verificarAdmin, catalogosController.obtenerPlataformas);

router.post('/proveedores', verificarAdmin, catalogosController.crearProveedor);
router.get('/proveedores', verificarAdmin, catalogosController.obtenerProveedores);

module.exports = router;