class EmailParser {
  decodeBase64(data) {
    if (!data) return '';
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  normalizeHeaders(headers = []) {
    if (!headers) return [];
    if (Array.isArray(headers)) return headers;

    return Object.entries(headers).map(([name, value]) => ({
      name,
      value: typeof value === 'string' ? value : value?.value || '',
    }));
  }

  extractBody(payload = {}) {
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

  extractHeaders(rawHeaders = []) {
    const headers = this.normalizeHeaders(rawHeaders);
    const find = (name) => {
      const key = name.toLowerCase();
      const header = headers.find((h) => (h.name || h.key || '').toLowerCase() === key);
      return header?.value || '';
    };

    const to =
      find('To') ||
      find('Delivered-To') ||
      find('X-Original-To') ||
      find('Envelope-To') ||
      (typeof rawHeaders === 'object' && rawHeaders?.to) ||
      '';

    return {
      subject: find('Subject') || '(Sin asunto)',
      from: find('From') || '(Desconocido)',
      to: to || '(Sin destinatario)',
      date: find('Date') || '',
    };
  }

  parseEmail(msg = {}) {
    const payload = msg.payload || msg.data?.payload || {};
    const headers = this.extractHeaders(
      payload.headers || msg.headers || msg.data?.headers || []
    );
    const body = this.extractBody(payload);

    return {
      id: msg.id || msg.messageId,
      threadId: msg.threadId || msg.thread_id,
      labelIds: msg.labelIds || msg.label_ids || [],
      snippet: msg.snippet || '',
      ...headers,
      body,
    };
  }
}

module.exports = new EmailParser();