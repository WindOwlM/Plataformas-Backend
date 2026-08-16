class EmailParser {
  decodeBase64(data) {
    if (!data) return '';
    // Gmail usa base64url
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  extractBody(payload) {
    let body = '';

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = this.decodeBase64(part.body.data);
          break;
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          body = this.decodeBase64(part.body.data);
        }
        if (part.parts) {
          const nested = this.extractBody(part);
          if (nested) body = nested;
        }
      }
    } else if (payload.body?.data) {
      body = this.decodeBase64(payload.body.data);
    }

    return body || '(Sin contenido de texto)';
  }

  extractHeaders(headers) {
    const find = (name) => headers.find(h => h.name === name)?.value || '';
    return {
      subject: find('Subject') || '(Sin asunto)',
      from: find('From') || '(Desconocido)',
      to: find('To') || '',
      date: find('Date') || '',
    };
  }

  parseEmail(msg) {
    const headers = this.extractHeaders(msg.payload.headers);
    const body = this.extractBody(msg.payload);

    return {
      id: msg.id,
      threadId: msg.threadId,
      labelIds: msg.labelIds,
      to: parsed.to, 
      snippet: msg.snippet,
      ...headers,
      body,
    };
  }
}

module.exports = new EmailParser();