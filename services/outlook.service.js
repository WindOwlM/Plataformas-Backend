const axios = require('axios');

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

class OutlookService {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  getHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async listMessages(limit = 10) {
    const { data } = await axios.get(
      `${GRAPH_API}/me/messages?$top=${limit}&$select=from,receivedDateTime,subject,bodyPreview,body,id`,
      { headers: this.getHeaders() }
    );
    return data.value || [];
  }

  async getMessage(messageId) {
    const { data } = await axios.get(
      `${GRAPH_API}/me/messages/${messageId}`,
      { headers: this.getHeaders() }
    );
    return data;
  }

  async getEmails(limit = 10) {
    const messages = await this.listMessages(limit);
    return messages.map(msg => ({
      id: msg.id,
      from: msg.from?.emailAddress?.name
        ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
        : msg.from?.emailAddress?.address || '(Desconocido)',
      date: msg.receivedDateTime,
      subject: msg.subject,
      body: msg.body?.content || msg.bodyPreview || '(Sin contenido)',
      bodyContentType: msg.body?.contentType || 'text',
    }));
  }
}

module.exports = OutlookService;