import crypto from 'crypto';
import { env } from './src/config/env';

function generateInitData(user: any): string {
    const params = new URLSearchParams();
    params.set('user', JSON.stringify(user));
    params.set('auth_date', Math.floor(Date.now() / 1000).toString());
    params.set('query_id', 'test_query_id');

    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(env.TELEGRAM_BOT_TOKEN)
        .digest();

    const hash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    params.set('hash', hash);
    return params.toString();
}

const initData = generateInitData({ id: 123, first_name: 'Test' });

fetch('http://localhost:8000/api/miniapp/predictions/leaderboard', {
    headers: { 'x-telegram-init-data': initData }
}).then(res => res.json()).then(console.log).catch(console.error);
