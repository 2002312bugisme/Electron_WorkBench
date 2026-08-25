import tls from 'node:tls';
import type { MailProvider } from '../../shared/types';

const servers: Record<MailProvider, { host: string; port: number }> = {
  qq: { host: 'smtp.qq.com', port: 465 },
  '163': { host: 'smtp.163.com', port: 465 },
  '126': { host: 'smtp.126.com', port: 465 },
  yeah: { host: 'smtp.yeah.net', port: 465 },
};

class SmtpSession {
  private buffer = ''; private waiters: Array<(response: string) => void> = []; private responses: string[] = [];
  constructor(readonly socket: tls.TLSSocket) {
    socket.setEncoding('utf8'); socket.on('data', (part: string) => this.receive(part));
  }
  private receive(part: string) {
    this.buffer += part;
    const lines = this.buffer.split(/\r?\n/); this.buffer = lines.pop() || '';
    let response = '';
    for (const line of lines) {
      response += `${line}\n`;
      if (/^\d{3}\s/.test(line)) { const resolve = this.waiters.shift(); if (resolve) resolve(response.trim()); else this.responses.push(response.trim()); response = ''; }
    }
  }
  response(): Promise<string> { const existing = this.responses.shift(); return existing ? Promise.resolve(existing) : new Promise((resolve) => this.waiters.push(resolve)); }
  async command(value: string, expected = 250) { this.socket.write(`${value}\r\n`); const response = await this.response(); if (!response.startsWith(String(expected))) throw new Error(`邮件服务器拒绝请求：${response.replace(/\r?\n/g, ' ')}`); }
}

function connect(provider: MailProvider): Promise<SmtpSession> {
  const server = servers[provider];
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: server.host, port: server.port, servername: server.host, rejectUnauthorized: true, timeout: 15_000 });
    socket.once('secureConnect', () => resolve(new SmtpSession(socket))); socket.once('error', reject); socket.once('timeout', () => socket.destroy(new Error('邮件服务器连接超时。')));
  });
}
const encoded = (value: string) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
const base64Lines = (value: string) => Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';

export async function sendSmtpMail(input: { provider: MailProvider; sender: string; authorizationCode: string; subject: string; markdown: string }) {
  if (!/^\S+@\S+\.\S+$/.test(input.sender)) throw new Error('请输入有效的发件邮箱。');
  if (!input.authorizationCode.trim()) throw new Error('请输入邮箱 SMTP 授权码。');
  const session = await connect(input.provider);
  try {
    const hello = await session.response(); if (!hello.startsWith('220')) throw new Error('邮件服务器未准备就绪。');
    await session.command('EHLO zzz-workstation'); await session.command('AUTH LOGIN', 334); await session.command(Buffer.from(input.sender).toString('base64'), 334); await session.command(Buffer.from(input.authorizationCode).toString('base64'), 235);
    await session.command(`MAIL FROM:<${input.sender}>`); await session.command(`RCPT TO:<${input.sender}>`); await session.command('DATA', 354);
    const message = [`From: <${input.sender}>`, `To: <${input.sender}>`, `Subject: ${encoded(input.subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/markdown; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(input.markdown), '.', ''].join('\r\n');
    session.socket.write(message); const accepted = await session.response(); if (!accepted.startsWith('250')) throw new Error(`邮件服务器未接受内容：${accepted}`);
    await session.command('QUIT', 221);
  } finally { session.socket.destroy(); }
}
