/* =====================================================
   ESPERON · main.js

   1.  Landing page: orbit parallax
   2.  Landing page: contact form + footer year
   3.  Login / Sign up pages
   4.  Dark mode toggle
   ===================================================== */


/* =====================================================
   1. LANDING PAGE: ORBIT PARALLAX
   Rings drift slightly with the mouse pointer.
   ===================================================== */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const orbit = document.querySelector('.orbit');
  if (!orbit) return; // not the landing page

  const rings = orbit.querySelectorAll('.ring');

  document.addEventListener('mousemove', e => {
    const x = (e.clientX / innerWidth - .5) * 2;
    const y = (e.clientY / innerHeight - .5) * 2;

    rings.forEach((ring, i) => {
      const depth = (i + 1) * 4;
      ring.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  });
})();


/* =====================================================
   2. LANDING PAGE: CONTACT FORM + FOOTER YEAR
   ===================================================== */
(function () {
  // Footer year
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Contact form
  const form = document.getElementById('contactForm');
  if (!form) return; // not the landing page

  const box = document.getElementById('contactAlert');

  function showMessage(msg, ok) {
    box.textContent = msg;
    box.classList.toggle('ok', !!ok);
    box.classList.remove('d-none');
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    box.classList.add('d-none');

    const name = form.querySelector('#cName');
    const email = form.querySelector('#cEmail');
    const message = form.querySelector('#cMsg');

    // Required fields
    let hasEmpty = false;
    [name, email, message].forEach(field => {
      const empty = !field.value.trim();
      field.classList.toggle('invalid', empty);
      if (empty) hasEmpty = true;
    });
    if (hasEmpty) return showMessage('Please fill in your name, email and message.');

    // Email format
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
      email.classList.add('invalid');
      return showMessage('Enter a valid email address.');
    }

    // TODO: replace with a real request to your backend or email service
    showMessage('Thanks, ' + name.value.trim().split(' ')[0] + '! Your message was sent (demo).', true);
    form.reset();
  });
})();


/* =====================================================
   3. LOGIN / SIGN UP PAGES
   ===================================================== */
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  if (!loginForm && !signupForm) return; // not an auth page

  /* ----- Google login settings -----
     1) Create an "OAuth client ID" (Web application) at
        https://console.cloud.google.com/apis/credentials
     2) Add your site address under "Authorized JavaScript origins"
        (e.g. http://localhost:5500)
     3) Paste the client ID below */
  const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

  /* ----- Shared helpers ----- */
  const alertBox = $('#alert');

  function showAlert(msg, ok) {
    alertBox.textContent = msg;
    alertBox.classList.toggle('ok', !!ok);
    alertBox.classList.remove('d-none');
  }

  function clearAlert() {
    alertBox.classList.add('d-none');
    $$('.field.invalid').forEach(field => field.classList.remove('invalid'));
  }

  // Marks empty required inputs and returns true when all are filled
  function validate(form) {
    let ok = true;
    $$('input[required]', form).forEach(input => {
      const empty = !input.value.trim();
      input.parentElement.classList.toggle('invalid', empty);
      if (empty) ok = false;
    });
    return ok;
  }

  /* ----- Show / hide password ----- */
  $$('.eye').forEach(btn => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';

    input.type = show ? 'text' : 'password';
    btn.innerHTML = '<i class="bi ' + (show ? 'bi-eye-slash' : 'bi-eye') + '"></i>';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  /* ----- Log in ----- */
  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      clearAlert();

      if (!validate(loginForm)) {
        return showAlert('Enter your school email or student ID and your password.');
      }

      // TODO: replace with a real request to your backend
      showAlert('Logged in (demo). Connect this form to your server to continue.', true);
    });
  }

  /* ----- Google login ----- */
  const googleBtn = $('#googleLogin');

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

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      clearAlert();

      if (GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
        return showAlert('Google login isn’t set up yet. Add your Google client ID in js/main.js.');
      }
      if (location.protocol === 'file:') {
        return showAlert('Google sign-in can’t run from a file. Open the site through a local server (for example VS Code Live Server at http://localhost:5500).');
      }

      googleBtn.disabled = true;

      try {
        await loadGoogle();

        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',

          callback: async resp => {
            googleBtn.disabled = false;
            if (resp.error) {
              return showAlert('Google sign-in was cancelled or failed. Please try again.');
            }

            try {
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: 'Bearer ' + resp.access_token }
              });
              const user = await res.json();

              // TODO: send resp.access_token to your backend, verify it there, then start the session
              showAlert('Signed in with Google as ' + user.email + ' (demo).', true);
            } catch (err) {
              showAlert('We couldn’t read your Google profile. Please try again.');
            }
          },

          error_callback: () => {
            googleBtn.disabled = false;
            showAlert('Google sign-in was cancelled or blocked. Allow pop-ups and try again.');
          }
        });

        client.requestAccessToken();
      } catch (err) {
        googleBtn.disabled = false;
        showAlert('We couldn’t reach Google. Check your connection and try again.');
      }
    });
  }

  /* ----- Sign up ----- */
  if (signupForm) {
    const passInput = $('#signPass');

    const passwordRules = {
      len: v => v.length >= 8,
      upper: v => /[A-Z]/.test(v),
      num: v => /\d/.test(v)
    };

      // Live password checklist + strength bars
    const strength = $('#strength');

    passInput.addEventListener('input', () => {
      let passed = 0;

      $$('#pass-checks li').forEach(li => {
        const ok = passwordRules[li.dataset.rule](passInput.value);
        li.classList.toggle('ok', ok);
        if (ok) passed++;
      });

      if (strength) strength.dataset.level = passed;
    });

    signupForm.addEventListener('submit', e => {
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

      // 3. Password strength
      if (!Object.values(passwordRules).every(rule => rule(passInput.value))) {
        passInput.parentElement.classList.add('invalid');
        return showAlert('Your password needs 8+ characters, one uppercase letter and one number.');
      }

      // 4. Passwords match
      const confirm = $('#signConfirm');
      if (confirm.value !== passInput.value) {
        confirm.parentElement.classList.add('invalid');
        return showAlert('The two passwords don’t match.');
      }

      // TODO: replace with a real request to your backend
      showAlert('Account created (demo). Connect this form to your server to continue.', true);
    });
  }
})();


/* =====================================================
   4. DARK MODE TOGGLE
   The saved / system theme is applied by a small script in
   each page's <head>; this part handles the button.
   ===================================================== */
(function () {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('.theme-toggle')];
  let transitionTimer;

  // Keep the buttons' labels in step with the current theme
  function sync() {
    const dark = root.getAttribute('data-theme') === 'dark';
    buttons.forEach(btn => {
      btn.setAttribute('aria-pressed', dark);
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function applyTheme(next, animate = false) {
    const update = () => {
      root.setAttribute('data-theme', next);
      sync();
    };

    clearTimeout(transitionTimer);
    if (animate && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('theme-transitioning');
      document.startViewTransition(update);
      return;
    }

    if (animate) {
      root.classList.add('theme-transitioning');
      transitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), 500);
    }
    update();
  }

  // Click: switch theme and remember it
  buttons.forEach(btn => btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('esperon-theme', next); } catch (e) {}
    applyTheme(next, true);
  }));

  // Follow the device setting until the visitor picks a theme themselves
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    let saved = null;
    try { saved = localStorage.getItem('esperon-theme'); } catch (err) {}

    if (!saved) {
      applyTheme(e.matches ? 'dark' : 'light', true);
    }
  });

  sync();
})();