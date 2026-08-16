const express = require('express');
const router = express.Router();
// const apiKeyAuth = require('../middleware/apiKey.middleware');
const outlookController = require('../controllers/outlook.controller');

// Protegido con API Key
// router.use(apiKeyAuth);

router.get('/auth/outlook', outlookController.redirectToMicrosoft);
router.get('/auth/outlook/callback', outlookController.handleCallback);
router.get('/outlook/accounts', outlookController.listAccounts);
router.get('/outlook/emails', outlookController.getEmails);

module.exports = router;