const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogos_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

// Todas protegidas con verificarAdmin
router.post('/plataformas', verificarAdmin, catalogosController.crearPlataforma);
router.get('/plataformas', verificarAdmin, catalogosController.obtenerPlataformas);

router.post('/proveedores', verificarAdmin, catalogosController.crearProveedor);
router.get('/proveedores', verificarAdmin, catalogosController.obtenerProveedores);

router.patch('/plataformas/:id', verificarAdmin, catalogosController.actualizarPlataforma);
router.patch('/proveedores/:id', verificarAdmin, catalogosController.actualizarProveedor);


module.exports = router;