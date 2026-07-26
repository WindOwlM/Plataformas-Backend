const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventas_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.post('/', verificarAdmin, ventasController.registrarVenta);
router.get('/', verificarAdmin, ventasController.obtenerVentas);
router.patch('/:id', verificarAdmin, ventasController.actualizarVenta);
router.delete('/:id', verificarAdmin, ventasController.eliminarVenta); // ← NUEVO

module.exports = router;