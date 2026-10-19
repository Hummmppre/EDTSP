(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n || 0);
  const day = d => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const stamp = d => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  const badge = s => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
  const field = (label, name, value, type = 'text', extra = '') =>
    `<label>${label}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
  const view = $('#view');
  const LOGIN = '/src/traineelogin.html';

  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.className = ''; }, 3500);
  }

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 || res.status === 403) { location.href = LOGIN; throw new Error('Please log in again.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  const get = p => api('/api/trainee/' + p);

  function onSubmit(id, handler) {
    const form = $(id);
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try { await handler(Object.fromEntries(new FormData(form))); }
      catch (err) { toast(err.message, true); }
    });
  }

  /* ---------- Overview + application status ---------- */
  async function overview() {
    const [me, app, pay, as, act] = await Promise.all([api('/api/me'), get('application'), get('payments'), get('assessments'), get('activities')]);
    const done = as.assessments.filter(a => a.submission).length;
    view.innerHTML = `
      <h1>Welcome, ${esc((me.user.name || '').split(' ')[0])}</h1>
      <p class="sub">Here is where your training stands.</p>
      <div class="grid">
        <div class="card"><small>Application</small><h3>${app.application ? badge(app.application.status) : '<span class="badge">not submitted</span>'}</h3><a href="#application">View application</a></div>
        <div class="card"><small>Remaining balance</small><h3>${peso(pay.remaining)}</h3><a href="#payments">See payments</a></div>
        <div class="card"><small>Assessments done</small><h3>${done} / ${as.assessments.length}</h3><a href="#assessments">Open assessments</a></div>
        <div class="card"><small>Cow care today</small><h3>${act.today.length} recorded</h3><a href="#care">Open cow care</a></div>
      </div>`;
  }

  /* ---------- Training application ---------- */
  const EXPERIENCE = ['None', 'Under 1 year', '1–3 years', 'Over 3 years'];

  async function application() {
    const { application: a } = await get('application');
    const summary = a ? `
      <div class="card">
        <div class="row"><h3>Your application</h3>${badge(a.status)}</div>
        <dl>
          <dt>Preferred start</dt><dd>${day(a.preferredStart)}</dd>
          <dt>Farm experience</dt><dd>${esc(a.experience)}</dd>
          <dt>Education</dt><dd>${esc(a.education)}</dd>
          <dt>Submitted</dt><dd>${day(a.submittedAt)}</dd>
          <dt>Your reason</dt><dd>${esc(a.motivation)}</dd>
          ${a.note ? `<dt>Note from admin</dt><dd>${esc(a.note)}</dd>` : ''}
        </dl>
      </div>` : '';
    const form = !a || a.status === 'rejected' ? `
      <form id="appForm" class="card" ${a ? 'style="margin-top:1rem"' : ''}>
        <h3>${a ? 'Apply again' : 'Training application'}</h3>
        ${field('Preferred start date', 'preferredStart', '', 'date', 'required')}
        <label>Farm experience<select name="experience">${EXPERIENCE.map(x => `<option>${x}</option>`).join('')}</select></label>
        ${field('Highest education', 'education', '', 'text', 'maxlength="120" required')}
        <label>Why do you want to train with Esperon?<textarea name="motivation" rows="5" maxlength="1000" required></textarea></label>
        <button class="btn">Submit application</button>
      </form>` : '';
    view.innerHTML = `<h1>Training application</h1><p class="sub">Apply for training and follow your status here.</p>${summary}${form}`;
    onSubmit('#appForm', async body => {
      await api('/api/trainee/application', 'POST', body);
      toast('Application submitted.');
      application();
    });
  }

  /* ---------- Trainee information ---------- */
  async function profile() {
    const { profile: p, email } = await get('profile');
    view.innerHTML = `
      <h1>My information</h1><p class="sub">Keep your details up to date.</p>
      <form id="pf" class="card">
        <div class="two">${field('First name', 'firstName', p.firstName, 'text', 'required')}${field('Last name', 'lastName', p.lastName, 'text', 'required')}</div>
        ${field('Email (from your account)', 'email', email, 'email', 'disabled')}
        <div class="two">${field('Phone', 'phone', p.phone, 'tel')}${field('Birth date', 'birthdate', p.birthdate, 'date')}</div>
        ${field('Address', 'address', p.address)}
        <div class="two">${field('Emergency contact', 'emergencyName', p.emergencyName)}${field('Emergency phone', 'emergencyPhone', p.emergencyPhone, 'tel')}</div>
        <button class="btn">Save changes</button>
      </form>`;
    onSubmit('#pf', async body => {
      await api('/api/trainee/profile', 'PUT', body);
      toast('Information saved.');
    });
  }

  /* ---------- Assessments ---------- */
  async function assessments() {
    const { assessments: list } = await get('assessments');
    view.innerHTML = `<h1>Assessments</h1><p class="sub">Complete the assessments assigned to you.</p><div class="stack">${
      list.map(a => `
        <div class="card row">
          <div><h3>${esc(a.title)}</h3><p class="sub" style="margin:.2rem 0 0">${esc(a.description)} · ${a.count} questions</p></div>
          ${a.submission ? `<span class="badge approved">${a.submission.score}/${a.submission.total}</span>` : `<button class="btn" data-id="${esc(a.id)}">Start</button>`}
        </div>`).join('') || '<p class="sub">No assessments assigned yet.</p>'}</div>`;
    view.querySelectorAll('[data-id]').forEach(b => { b.onclick = () => quiz(b.dataset.id); });
  }

  async function quiz(id) {
    try {
      const { assessment: a } = await get('assessments/' + id);
      view.innerHTML = `<h1>${esc(a.title)}</h1><form id="qf" class="stack">${
        a.questions.map((q, i) => `
          <fieldset class="card"><legend>${i + 1}. ${esc(q.text)}</legend>
            ${q.options.map((o, j) => `<label class="opt"><input type="radio" name="${esc(q.id)}" value="${j}" required> ${esc(o)}</label>`).join('')}
          </fieldset>`).join('')}
        <div><button class="btn">Submit answers</button></div></form>`;
      $('#qf').onsubmit = async e => {
        e.preventDefault();
        const answers = {};
        a.questions.forEach(q => {
          const c = $(`input[name="${q.id}"]:checked`);
          if (c) answers[q.id] = Number(c.value);
        });
        try {
          const r = await api(`/api/trainee/assessments/${id}/submit`, 'POST', { answers });
          toast(`Submitted. Your score: ${r.score}/${r.total}`);
          location.hash = '#results';
        } catch (err) { toast(err.message, true); }
      };
    } catch (err) { toast(err.message, true); }
  }

  /* ---------- Assessment results ---------- */
  async function results() {
    const { results: list } = await get('results');
    view.innerHTML = `<h1>My results</h1><p class="sub">Scores from your submitted assessments.</p>
      <div class="card"><table><thead><tr><th>Assessment</th><th>Score</th><th>Percent</th><th>Submitted</th></tr></thead><tbody>${
        list.map(r => `<tr><td>${esc(r.title)}</td><td>${r.score}/${r.total}</td><td>${r.percent}%</td><td>${day(r.submittedAt)}</td></tr>`).join('')
        || '<tr><td colspan="4">No results yet. Submit an assessment first.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Payments ---------- */
  async function payments() {
    const p = await get('payments');
    view.innerHTML = `<h1>Payments</h1><p class="sub">${p.hasFee ? 'Your training fee and payments.' : 'Your administrator has not set your training fee yet.'}</p>
      <div class="grid">
        <div class="card"><small>Total training payment</small><h3>${peso(p.total)}</h3></div>
        <div class="card"><small>Paid so far</small><h3>${peso(p.paid)}</h3></div>
        <div class="card"><small>Remaining balance</small><h3>${peso(p.remaining)}</h3></div>
      </div>
      <h2>Payment history</h2>
      <div class="card"><table><thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead><tbody>${
        p.history.map(h => `<tr><td>${day(h.date)}</td><td>${peso(h.amount)}</td><td>${esc(h.note)}</td></tr>`).join('')
        || '<tr><td colspan="3">No payments recorded yet.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Cow care: schedules + activity recording ---------- */
  let careType = 'feeding';

  async function care() {
    const [{ schedules }, { activities, today }] = await Promise.all([get('schedules'), get('activities')]);
    const rows = schedules.filter(s => s.type === careType);
    view.innerHTML = `<h1>Cow care</h1><p class="sub">View schedules and record what you completed.</p>
      <div class="tabs">${['feeding', 'drinking', 'medication'].map(t =>
        `<button class="${t === careType ? 'on' : ''}" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <div class="card"><table><thead><tr><th>Time</th><th>Cow / group</th><th>Details</th><th></th></tr></thead><tbody>${
        rows.map(s => `<tr><td>${esc(s.time)}</td><td>${esc(s.cow)}</td><td>${esc(s.details)}</td><td>${
          today.includes(s.id) ? '<span class="badge approved">done today</span>' : `<button class="btn sm" data-s="${esc(s.id)}">Mark done</button>`}</td></tr>`).join('')
        || '<tr><td colspan="4">No schedule yet.</td></tr>'}</tbody></table></div>
      <h2>Recent activity</h2>
      <div class="card"><table><thead><tr><th>When</th><th>Activity</th><th>Cow / group</th></tr></thead><tbody>${
        activities.map(a => `<tr><td>${stamp(a.completedAt)}</td><td>${badge(a.type)}</td><td>${esc(a.cow)}</td></tr>`).join('')
        || '<tr><td colspan="3">Nothing recorded yet.</td></tr>'}</tbody></table></div>`;

    view.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { careType = b.dataset.t; care(); }; });
    view.querySelectorAll('[data-s]').forEach(b => {
      b.onclick = async () => {
        try { await api('/api/trainee/activities', 'POST', { scheduleId: b.dataset.s }); toast('Activity recorded.'); care(); }
        catch (err) { toast(err.message, true); }
      };
    });
  }

  /* ---------- Router + logout ---------- */
  const views = { overview, application, profile, assessments, results, payments, care };

  async function route() {
    const key = (location.hash || '#overview').slice(1);
    const name = Object.prototype.hasOwnProperty.call(views, key) ? key : 'overview';
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
    view.innerHTML = '<p class="sub">Loading…</p>';
    try { await views[name](); }
    catch (err) { if (err.message !== 'Please log in again.') view.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }

  addEventListener('hashchange', route);
  route();

  $('#out').onclick = async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = LOGIN;
  };
})();