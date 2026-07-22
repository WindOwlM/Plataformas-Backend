const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventas.controller.js');
const verificarAdmin = require('../middlewares/auth.middleware.js');

router.post('/', verificarAdmin, ventasController.registrarVenta);
router.get('/', verificarAdmin, ventasController.obtenerVentas);

module.exports = router;