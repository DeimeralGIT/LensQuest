import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_STATUS_CHAT_ID || process.env.TELEGRAM_CHAT_ID_STATUS;
const replyTo = Number(process.env.TELEGRAM_STATUS_REPLY_TO || '0') || undefined;
const threadId = Number(process.env.TELEGRAM_STATUS_THREAD_ID || process.env.TELEGRAM_STATUS_REPLY_TO || '0') || undefined;
const appName = process.env.APP_NAME || 'LensQuest';
const deployEnv = process.env.DEPLOY_ENV || process.env.NODE_ENV || 'production';
const hostingUrl = process.env.HOSTING_URL || 'https://lensquest-6f1b7.web.app';

if (!token || !chatId) {
    throw new Error('Missing Telegram deploy env vars: TELEGRAM_BOT_TOKEN/TELEGRAM_TOKEN and TELEGRAM_STATUS_CHAT_ID/TELEGRAM_CHAT_ID_STATUS are required.');
}

const text = [
    `✅ <b>${appName} Deploy Successful</b>`,
    `Environment: <b>${deployEnv}</b>`,
    `URL: ${hostingUrl}`,
    `Time: ${new Date().toISOString()}`,
].join('\n');

const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(threadId ? { message_thread_id: threadId } : {}),
    ...(replyTo ? { reply_to_message_id: replyTo } : {}),
};

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
});

if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram deploy notification failed: ${response.status} ${body}`);
}

console.log('Telegram deploy notification sent.');
