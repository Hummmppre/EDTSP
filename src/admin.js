(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const loginForm = $('#admin-login-form');
  const signupForm = $('#admin-signup-form');
  if (!loginForm && !signupForm) return;

  /* ----- Google login settings -----
     Paste the same client ID you use in .env and main.js */
  const ADMIN_GOOGLE_CLIENT_ID = '732939914611-58m2deujfa9cdap8klm4d65oept0q9jp.apps.googleusercontent.com';

  const alertBox = $('#alert');

  function showAlert(msg, ok) {
    alertBox.textContent = msg;
    alertBox.classList.toggle('ok', !!ok);
    alertBox.classList.remove('d-none');
    alertBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function clearAlert() {
    alertBox.classList.add('d-none');
    $$('.field.invalid').forEach(field => field.classList.remove('invalid'));
  }

  function validate(form) {
    let ok = true;
    $$('input[required]', form).forEach(input => {
      const empty = !input.value.trim();
      input.parentElement.classList.toggle('invalid', empty);
      if (empty) ok = false;
    });
    return ok;
  }

  async function postJSON(url, body) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error('Can’t reach the server. Make sure it is running (node server.js).');
    }

    let data = {};
    try { data = await res.json(); } catch (err) {}
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function setBusy(form, busy) {
    const btn = $('.btn-submit', form);
    if (btn) btn.disabled = busy;
  }

  // Show / hide password
  $$('.eye').forEach(btn => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = '<i class="bi ' + (show ? 'bi-eye-slash' : 'bi-eye') + '"></i>';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  /* ----- Admin log in ----- */
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      clearAlert();

      if (!validate(loginForm)) {
        return showAlert('Enter your username or email and your password.');
      }

      setBusy(loginForm, true);
      try {
        await postJSON('/api/admin/login', {
          username: $('#adminId').value.trim(),
          password: $('#adminPass').value
        });
        showAlert('Welcome back! Opening the admin portal…', true);
        setTimeout(() => { location.href = '/admin-portal'; }, 600);
      } catch (err) {
        setBusy(loginForm, false);
        showAlert(err.message);
      }
    });
  }

   /* ----- Admin Google login ----- */
  const GOOGLE_CLIENT_ID = '732939914611-58m2deujfa9cdap8klm4d65oept0q9jp.apps.googleusercontent.com';

  function loadGoogle() {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts) return resolve();

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google'));
      document.head.appendChild(script);
    });
  }

  const googleBtn = $('#googleLogin');

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      clearAlert();

      const idLooksReal =
        GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com') &&
        !GOOGLE_CLIENT_ID.startsWith('123456789-') &&
        !GOOGLE_CLIENT_ID.includes('PASTE');

      if (!idLooksReal) {
        return showAlert('Google login isn’t set up yet. Paste your real Google client ID in admin.js.');
      }
      if (location.protocol === 'file:') {
        return showAlert('Open the site through your Node server (http://localhost:3000), not as a file.');
      }

      googleBtn.disabled = true;

      try {
        await loadGoogle();

        const client = google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          ux_mode: 'popup',

          callback: async resp => {
            googleBtn.disabled = false;
            if (resp.error || !resp.code) {
              return showAlert('Google sign-in was cancelled or failed. Please try again.');
            }

            try {
              const res = await fetch('/api/admin/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ code: resp.code })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Sign-in failed.');

              showAlert('Welcome back! Opening the admin portal…', true);
              setTimeout(() => { location.href = '/admin-portal'; }, 700);
            } catch (err) {
              showAlert(err.message || 'We couldn’t sign you in. Please try again.');
            }
          },

          error_callback: () => {
            googleBtn.disabled = false;
            showAlert('Google sign-in was cancelled or blocked. Allow pop-ups and try again.');
          }
        });

        client.requestCode();
      } catch (err) {
        googleBtn.disabled = false;
        showAlert('We couldn’t reach Google. Check your connection and try again.');
      }
    });
  }

  /* ----- Admin sign up ----- */
  if (signupForm) {
    const passInput = $('#signPass');
    const strength = $('#strength');

    const passwordRules = {
      len: v => v.length >= 8,
      upper: v => /[A-Z]/.test(v),
      num: v => /\d/.test(v)
    };

    // Live password checklist + strength bars
    passInput.addEventListener('input', () => {
      let passed = 0;
      $$('#pass-checks li').forEach(li => {
        const ok = passwordRules[li.dataset.rule](passInput.value);
        li.classList.toggle('ok', ok);
        if (ok) passed++;
      });
      if (strength) strength.dataset.level = passed;
    });

    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      clearAlert();

      // 1. Required fields
      if (!validate(signupForm)) {
        return showAlert('Please fill in all required fields.');
      }

      // 2. Email format
      const email = $('#signEmail');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
        email.parentElement.classList.add('invalid');
        return showAlert('Enter a valid email address.');
      }

      // 3. Username format
      const user = $('#signUser');
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(user.value.trim())) {
        user.parentElement.classList.add('invalid');
        return showAlert('Username: 3–30 characters, letters, numbers, dot, dash or underscore only.');
      }

      // 4. Password strength
      if (!Object.values(passwordRules).every(rule => rule(passInput.value))) {
        passInput.parentElement.classList.add('invalid');
        return showAlert('Your password needs 8+ characters, one uppercase letter and one number.');
      }

      // 5. Passwords match
      const confirm = $('#signConfirm');
      if (confirm.value !== passInput.value) {
        confirm.parentElement.classList.add('invalid');
        return showAlert('The two passwords don’t match.');
      }

      // 6. Send to the server (it checks the access code)
      setBusy(signupForm, true);
      try {
        await postJSON('/api/admin/signup', {
          firstName: $('#firstName').value.trim(),
          lastName: $('#lastName').value.trim(),
          email: email.value.trim(),
          phone: $('#signPhone').value.trim(),
          username: user.value.trim(),
          password: passInput.value,
          accessCode: $('#accessCode').value.trim()
        });
        showAlert('Admin account created! Opening the admin portal…', true);
        setTimeout(() => { location.href = '/admin-portal'; }, 700);
      } catch (err) {
        setBusy(signupForm, false);
        showAlert(err.message);
      }
    });
  }
})();