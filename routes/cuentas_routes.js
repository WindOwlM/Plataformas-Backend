const express = require('express');
const router = express.Router();
const cuentasController = require('../controllers/cuentas_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.post('/crear', verificarAdmin, cuentasController.crearCuenta);
router.get('/', verificarAdmin, cuentasController.obtenerCuentas);
router.get('/:id/contrasena', verificarAdmin, cuentasController.obtenerContrasena);
router.patch('/:id', verificarAdmin, cuentasController.actualizarCuenta);
router.delete('/:id', verificarAdmin, cuentasController.eliminarCuenta);

module.exports = router;