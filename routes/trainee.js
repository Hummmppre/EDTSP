const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const FILE = path.join(__dirname, '..', 'data', 'app.json');
const clone = o => JSON.parse(JSON.stringify(o));

/* Starter data. Admins will manage assessments and schedules later. */
const SEED = {
  fees: {}, payments: [], applications: {}, profiles: {}, submissions: [], activities: [],
  assessments: [
    { id: 'a1', title: 'Dairy Basics', description: 'Core knowledge for new trainees (sample).', questions: [
      { id: 'q1', text: 'Cows are ruminants. What does that mean?', options: ['They digest plant fiber with a four-part stomach', 'They only eat meat', 'They cannot drink water', 'They have no stomach'], answer: 0 },
      { id: 'q2', text: 'Clean, fresh drinking water for dairy cows should be available:', options: ['Only at milking', 'Once a week', 'At all times', 'Only in summer'], answer: 2 },
      { id: 'q3', text: 'Why is a feeding schedule kept consistent?', options: ['It keeps the herd settled and healthy', 'To make cows hungry', 'It makes no difference', 'To reduce milk'], answer: 0 }
    ] },
    { id: 'a2', title: 'Animal Health & Medication', description: 'Safe handling of medication (sample).', questions: [
      { id: 'q1', text: 'Before giving any medication, you should:', options: ['Guess the dose', 'Check the schedule and instructions', 'Skip the record', 'Ask a neighbor'], answer: 1 },
      { id: 'q2', text: 'After giving medication you should:', options: ['Record it right away', 'Wait a week', 'Never record it', 'Tell nobody'], answer: 0 },
      { id: 'q3', text: 'A cow looks unwell. What should you do first?', options: ['Ignore it', 'Report it to your supervisor', 'Give random medicine', 'Move it away silently'], answer: 1 }
    ] }
  ],
  schedules: [
    { id: 's1', type: 'feeding', cow: 'Herd A', time: '06:00', details: 'Hay and concentrate feed (sample)' },
    { id: 's2', type: 'feeding', cow: 'Herd A', time: '16:00', details: 'Hay and silage (sample)' },
    { id: 's3', type: 'drinking', cow: 'Herd A', time: '07:00', details: 'Check and refill water troughs (sample)' },
    { id: 's4', type: 'drinking', cow: 'Herd A', time: '15:00', details: 'Check and refill water troughs (sample)' },
    { id: 's5', type: 'medication', cow: 'Herd A', time: '08:00', details: 'Give prescribed supplement per supervisor (sample)' },
    { id: 's6', type: 'medication', cow: 'Herd A', time: '17:00', details: 'Treat any cows flagged by supervisor (sample)' }
  ]
};

function save(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}
function load() {
  try { return Object.assign(clone(SEED), JSON.parse(fs.readFileSync(FILE, 'utf8'))); }
  catch (e) { const d = clone(SEED); save(d); return d; }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const today = () => {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
};
const EXPERIENCE = ['None', 'Under 1 year', '1–3 years', 'Over 3 years'];

const router = express.Router();

/* ----- Application ----- */
router.get('/application', (req, res) => {
  res.json({ application: load().applications[req.user.id] || null });
});

router.post('/application', (req, res) => {
  const d = load(), uid = req.user.id, old = d.applications[uid], b = req.body || {};
  if (old && old.status !== 'rejected') return res.status(409).json({ error: 'You already have an application on file.' });

  const a = {
    preferredStart: str(b.preferredStart, 10), experience: str(b.experience, 40),
    education: str(b.education, 120), motivation: str(b.motivation, 1000)
  };
  if (!isDate(a.preferredStart) || !EXPERIENCE.includes(a.experience) || !a.education || a.motivation.length < 20) {
    return res.status(400).json({ error: 'Please complete every field (your reason needs at least 20 characters).' });
  }
  d.applications[uid] = { ...a, status: 'pending', submittedAt: new Date().toISOString(), note: '' };
  save(d);
  res.json({ application: d.applications[uid] });
});

/* ----- Trainee information ----- */
router.get('/profile', (req, res) => {
  const [first, ...rest] = (req.user.name || '').split(' ');
  const p = load().profiles[req.user.id] || { firstName: first || '', lastName: rest.join(' ') };
  res.json({ profile: p, email: req.user.email });
});

router.put('/profile', (req, res) => {
  const b = req.body || {};
  const p = {
    firstName: str(b.firstName, 60), lastName: str(b.lastName, 60), phone: str(b.phone, 20),
    birthdate: str(b.birthdate, 10), address: str(b.address, 200),
    emergencyName: str(b.emergencyName, 80), emergencyPhone: str(b.emergencyPhone, 20)
  };
  if (!p.firstName || !p.lastName) return res.status(400).json({ error: 'First and last name are required.' });
  const phoneOk = v => !v || /^[0-9+()\-\s]{7,20}$/.test(v);
  if (!phoneOk(p.phone) || !phoneOk(p.emergencyPhone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (p.birthdate && !isDate(p.birthdate)) return res.status(400).json({ error: 'Enter a valid birth date.' });

  const d = load();
  d.profiles[req.user.id] = p;
  save(d);
  res.json({ profile: p });
});

/* ----- Assessments ----- */
const mySubmission = (d, uid, aid) => d.submissions.find(s => s.userId === uid && s.assessmentId === aid);

router.get('/assessments', (req, res) => {
  const d = load();
  res.json({
    assessments: d.assessments.map(a => {
      const s = mySubmission(d, req.user.id, a.id);
      return {
        id: a.id, title: a.title, description: a.description, count: a.questions.length,
        submission: s ? { score: s.score, total: s.total, submittedAt: s.submittedAt } : null
      };
    })
  });
});

router.get('/assessments/:id', (req, res) => {
  const d = load(), a = d.assessments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Assessment not found.' });
  if (mySubmission(d, req.user.id, a.id)) return res.status(409).json({ error: 'You already submitted this assessment.' });
  res.json({ assessment: { id: a.id, title: a.title, questions: a.questions.map(q => ({ id: q.id, text: q.text, options: q.options })) } });
});

router.post('/assessments/:id/submit', (req, res) => {
  const d = load(), a = d.assessments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Assessment not found.' });
  if (mySubmission(d, req.user.id, a.id)) return res.status(409).json({ error: 'You already submitted this assessment.' });

  const answers = (req.body || {}).answers || {};
  let score = 0;
  for (const q of a.questions) {
    const v = answers[q.id];
    if (!Number.isInteger(v) || v < 0 || v >= q.options.length) return res.status(400).json({ error: 'Please answer every question.' });
    if (v === q.answer) score++;
  }
  d.submissions.push({ id: crypto.randomUUID(), userId: req.user.id, assessmentId: a.id, answers, score, total: a.questions.length, submittedAt: new Date().toISOString() });
  save(d);
  res.json({ score, total: a.questions.length });
});

router.get('/results', (req, res) => {
  const d = load();
  const results = d.submissions.filter(s => s.userId === req.user.id).map(s => {
    const a = d.assessments.find(x => x.id === s.assessmentId);
    return { title: a ? a.title : 'Removed assessment', score: s.score, total: s.total, percent: Math.round(100 * s.score / s.total), submittedAt: s.submittedAt };
  }).reverse();
  res.json({ results });
});

/* ----- Payments (set by the administrator) ----- */
router.get('/payments', (req, res) => {
  const d = load(), uid = req.user.id;
  const history = d.payments.filter(p => p.userId === uid).sort((a, b) => b.date.localeCompare(a.date))
    .map(p => ({ id: p.id, amount: p.amount, date: p.date, note: p.note || '' }));
  const total = d.fees[uid] || 0;
  const paid = history.reduce((sum, p) => sum + p.amount, 0);
  res.json({ hasFee: uid in d.fees, total, paid, remaining: Math.max(total - paid, 0), history });
});

/* ----- Cow maintenance ----- */
router.get('/schedules', (req, res) => res.json({ schedules: load().schedules }));

router.get('/activities', (req, res) => {
  const d = load(), mine = d.activities.filter(x => x.userId === req.user.id);
  res.json({
    today: mine.filter(x => x.date === today()).map(x => x.scheduleId),
    activities: mine.slice(-50).reverse()
  });
});

router.post('/activities', (req, res) => {
  const d = load(), uid = req.user.id;
  const s = d.schedules.find(x => x.id === (req.body || {}).scheduleId);
  if (!s) return res.status(404).json({ error: 'Schedule not found.' });
  if (d.activities.some(x => x.userId === uid && x.scheduleId === s.id && x.date === today())) {
    return res.status(409).json({ error: 'You already recorded this activity today.' });
  }
  d.activities.push({ id: crypto.randomUUID(), userId: uid, scheduleId: s.id, type: s.type, cow: s.cow, time: s.time, date: today(), completedAt: new Date().toISOString() });
  save(d);
  res.json({ ok: true });
});

module.exports = router;
router.store = { load, save };