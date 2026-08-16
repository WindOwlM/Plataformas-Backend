const outlookAuthService = require('../services/outlookAuth.service');
const OutlookService = require('../services/outlook.service');

class OutlookController {
  /**
   * GET /auth/outlook?email=usuario@outlook.com
   */
  redirectToMicrosoft(req, res) {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Falta ?email=' });
    }
    const url = outlookAuthService.getAuthUrl(email);
    res.redirect(url);
  }

  /**
   * GET /auth/outlook/callback
   */
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros' });
      }

      const email = Buffer.from(state, 'base64').toString('utf8');
      const tokens = await outlookAuthService.getTokens(code);
      await outlookAuthService.saveTokens(email, tokens);

      res.json({
        success: true,
        message: `Cuenta Outlook ${email} conectada.`,
        email,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al conectar Outlook',
        error: error.message,
      });
    }
  }

  /**
   * GET /outlook/accounts
   */
  async listAccounts(req, res) {
    const accounts = await outlookAuthService.listConnectedAccounts();
    res.json({ success: true, count: accounts.length, accounts });
  }

  /**
   * GET /outlook/emails?email=usuario@outlook.com&limit=2
   */
  async getEmails(req, res) {
    try {
      const { email, limit = 2 } = req.query;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Falta ?email=' });
      }

      const accessToken = await outlookAuthService.createAuthClient(email);
      const outlookService = new OutlookService(accessToken);
      const emails = await outlookService.getEmails(parseInt(limit));

      res.json({
        success: true,
        account: email,
        count: emails.length,
        emails,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new OutlookController();