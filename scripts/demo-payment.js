// Test helper until the admin side exists.
// Usage: node scripts/demo-payment.js you@gmail.com 20000 5000 approved
const fs = require('fs');
const path = require('path');
const { store } = require('../routes/trainee');

const [email, total, paid, status] = process.argv.slice(2);
const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const u = users.find(x => (x.email || '').toLowerCase() === (email || '').toLowerCase());
if (!u) { console.error('No user with that email. Sign in with Google once first.'); process.exit(1); }

const d = store.load();
d.fees[u.id] = Number(total) || 0;
if (Number(paid) > 0) {
  d.payments.push({ id: Date.now().toString(36), userId: u.id, amount: Number(paid), date: new Date().toISOString(), note: 'Demo payment' });
}
if (status && d.applications[u.id]) d.applications[u.id].status = status;
store.save(d);
console.log('Done for ' + u.email);