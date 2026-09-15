import crypto from 'crypto';
const a = Buffer.from('TEAM_TEST', 'utf8').toString('base64url');
const b = Buffer.from('Test User', 'utf8').toString('base64url');
const sig = crypto.createHmac('sha256', '3cb508625b9620dd3e53c73e14b87c379942f8b7624912a3bf78384e3a70faa4').update(a + '.' + b, 'utf8').digest('hex');
console.log(a + '.' + b + '.' + sig);
