const GmailService = require('../services/gmail.service');

class EmailController {
  /**
   * GET /emails?email=usuario@gmail.com&q=busqueda&limit=10
   */
  async getEmails(req, res) {
    try {
      const { email, q, limit = 10 } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Debes proporcionar ?email=usuario@gmail.com',
        });
      }

      const auth = await req.googleAuth.createAuthClient(email);
      const gmailService = new GmailService(auth);
      const emails = await gmailService.getEmails(q || '', parseInt(limit));

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

  /**
   * GET /emails/:id?email=usuario@gmail.com
   */
  async getEmailById(req, res) {
    try {
      const { id } = req.params;
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Debes proporcionar ?email=usuario@gmail.com',
        });
      }

      const auth = await req.googleAuth.createAuthClient(email);
      const gmailService = new GmailService(auth);
      const message = await gmailService.getMessage(id);
      const parsed = require('../utils/emailParser').parseEmail(message);

      res.json({
        success: true,
        account: email,
        email: parsed,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /profile?email=usuario@gmail.com
   */
  async getProfile(req, res) {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Debes proporcionar ?email=usuario@gmail.com',
        });
      }

      const auth = await req.googleAuth.createAuthClient(email);
      const gmailService = new GmailService(auth);
      const profile = await gmailService.getProfile();

      res.json({
        success: true,
        account: email,
        profile,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /search?email=usuario@gmail.com&subject=asunto&from=remitente&limit=10
   * Búsqueda avanzada por campos específicos.
   */
  async searchEmails(req, res) {
    try {
      const { email, subject, from, to, unread, limit = 10 } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Debes proporcionar ?email=usuario@gmail.com',
        });
      }

      // Construir query de Gmail
      let query = '';
      if (subject) query += `subject:${subject} `;
      if (from) query += `from:${from} `;
      if (to) query += `to:${to} `;
      if (unread === 'true') query += 'is:unread ';

      const auth = await req.googleAuth.createAuthClient(email);
      const gmailService = new GmailService(auth);
      const emails = await gmailService.getEmails(query.trim(), parseInt(limit));

      res.json({
        success: true,
        account: email,
        query: query.trim(),
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

module.exports = new EmailController();