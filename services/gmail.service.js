const { google } = require('googleapis');
const emailParser = require('../utils/emailParser');

class GmailService {
  constructor(auth) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(query = '', maxResults = 10) {
    const res = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });
    return res.data.messages || [];
  }

  async getMessage(messageId) {
    const res = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return res.data;
  }

  async getEmails(query = '', maxResults = 10) {
    const messages = await this.listMessages(query, maxResults);
    const emails = [];

    for (const msg of messages) {
      const fullMsg = await this.getMessage(msg.id);
      emails.push(emailParser.parseEmail(fullMsg));
    }

    return emails;
  }

  async getProfile() {
    const res = await this.gmail.users.getProfile({ userId: 'me' });
    return res.data;
  }
}

module.exports = GmailService;