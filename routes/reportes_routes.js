const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.get('/resumen', verificarAdmin, reportesController.resumen);

module.exports = router;
