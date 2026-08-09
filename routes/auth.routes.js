const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.get('/google', authController.redirectToGoogle);
router.get('/google/callback', authController.handleCallback);
router.get('/accounts', authController.listAccounts);

module.exports = router;