const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

const registerForm = document.querySelector('#register-form');
const registerMsg = document.querySelector('#register-msg');
const loginForm = document.querySelector('#login-form');
const loginMsg = document.querySelector('#login-msg');
const profileForm = document.querySelector('#profile-form');
const profileMsg = document.querySelector('#profile-msg');
const searchForm = document.querySelector('#search-form');
const memberResults = document.querySelector('#member-results');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const messageMsg = document.querySelector('#message-msg');
const messageThread = document.querySelector('#message-thread');
const chatWith = document.querySelector('#chat-with');
const appHub = document.querySelector('.app-hub');

let authToken = localStorage.getItem('hb_token') || '';
let currentUser = null;
let selectedMember = null;

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

function setMessage(node, text, type) {
  if (!node) return;
  node.className = 'form-msg';
  node.textContent = text;
  if (type) node.classList.add(type);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function sanitize(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memberPhotoUrl(member) {
  const directPhoto = member.photoUrl || member.avatarUrl || member.image || member.profilePicture || member.profileImage;
  if (directPhoto) return String(directPhoto);

  const name = encodeURIComponent(member.name || 'Member');
  return `https://ui-avatars.com/api/?name=${name}&background=ff5d73&color=ffffff&size=128`;
}
function renderMembers(members) {
  if (!memberResults) return;

  if (!members.length) {
    memberResults.innerHTML = '<p>No members found yet.</p>';
    return;
  }

  memberResults.innerHTML = members.map((member) => {
    const interests = (member.interests || []).join(', ') || 'No interests added';
    const bio = member.bio || 'No bio yet';
    const photo = memberPhotoUrl(member);

    return `
      <article class="member-result">
        <div class="member-result-head">
          <img src="${sanitize(photo)}" alt="Profile picture of ${sanitize(member.name || 'member')}" class="member-photo" loading="lazy" />
          <div>
            <h4>${sanitize(member.name)}</h4>
            <p>${sanitize(member.country || 'Unknown location')}</p>
          </div>
        </div>
        <p>${sanitize(interests)}</p>
        <p>${sanitize(bio)}</p>
        <button class="btn btn-small" data-member-id="${sanitize(member.id)}">Message</button>
      </article>
    `;
  }).join('');
}

function renderThread(messages) {
  if (!messageThread || !currentUser) return;

  if (!messages.length) {
    messageThread.innerHTML = '<p>No messages yet. Start the conversation.</p>';
    return;
  }

  messageThread.innerHTML = messages.map((message) => {
    const direction = message.fromUserId === currentUser.id ? 'sent' : 'received';
    return `<div class="bubble ${direction}">${sanitize(message.text)}</div>`;
  }).join('');

  messageThread.scrollTop = messageThread.scrollHeight;
}

function setHubVisibility(isVisible) {
  if (!appHub) return;
  appHub.classList.toggle('hidden', !isVisible);
}

function fillProfileForm(user) {
  if (!profileForm || !user) return;

  profileForm.name.value = user.name || '';
  profileForm.country.value = user.country || '';
  profileForm.interests.value = (user.interests || []).join(', ');
  profileForm.photoUrl.value = user.photoUrl || '';
  profileForm.bio.value = user.bio || '';
}

async function refreshSession() {
  if (!authToken) {
    setHubVisibility(false);
    return;
  }

  try {
    const me = await api('/api/me');
    currentUser = me.user;
    setHubVisibility(true);
    fillProfileForm(currentUser);
    await loadMembers();
  } catch {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('hb_token');
    setHubVisibility(false);
  }
}

async function loadMembers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.country) params.set('country', filters.country);
  if (filters.interest) params.set('interest', filters.interest);

  const data = await api(`/api/members?${params.toString()}`);
  renderMembers(data.members || []);
}

async function loadThread() {
  if (!selectedMember) return;
  const data = await api(`/api/messages/${encodeURIComponent(selectedMember.id)}`);
  renderThread(data.messages || []);
}

if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: registerForm.name.value.trim(),
      email: registerForm.email.value.trim(),
      country: registerForm.country.value.trim(),
      password: registerForm.password.value,
    };

    try {
      const result = await api('/api/auth/register', { method: 'POST', body: payload });
      authToken = result.token;
      localStorage.setItem('hb_token', authToken);
      setMessage(registerMsg, 'Account created. You are now signed in.', 'success');
      registerForm.reset();
      await refreshSession();
    } catch (error) {
      setMessage(registerMsg, error.message, 'error');
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      email: loginForm.email.value.trim(),
      password: loginForm.password.value,
    };

    try {
      const result = await api('/api/auth/login', { method: 'POST', body: payload });
      authToken = result.token;
      localStorage.setItem('hb_token', authToken);
      setMessage(loginMsg, 'Signed in successfully.', 'success');
      loginForm.reset();
      await refreshSession();
    } catch (error) {
      setMessage(loginMsg, error.message, 'error');
    }
  });
}

if (profileForm) {
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: profileForm.name.value.trim(),
      country: profileForm.country.value.trim(),
      interests: profileForm.interests.value.split(',').map((x) => x.trim()).filter(Boolean),
      photoUrl: profileForm.photoUrl.value.trim(),
      bio: profileForm.bio.value.trim(),
    };

    try {
      const result = await api('/api/me', { method: 'PUT', body: payload });
      currentUser = result.user;
      setMessage(profileMsg, 'Profile updated.', 'success');
      await loadMembers();
    } catch (error) {
      setMessage(profileMsg, error.message, 'error');
    }
  });
}

if (searchForm) {
  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const filters = {
      query: searchForm.query.value.trim(),
      country: searchForm.country.value.trim(),
      interest: searchForm.interest.value.trim(),
    };

    try {
      await loadMembers(filters);
    } catch (error) {
      setMessage(messageMsg, error.message, 'error');
    }
  });
}

if (memberResults) {
  memberResults.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-member-id]');
    if (!button) return;

    const memberId = button.getAttribute('data-member-id');
    if (!memberId) return;

    try {
      const data = await api('/api/members');
      const member = (data.members || []).find((entry) => entry.id === memberId);
      if (!member) {
        setMessage(messageMsg, 'Could not select member.', 'error');
        return;
      }

      selectedMember = member;
      chatWith.textContent = `Chatting with ${member.name} (${member.country || 'Unknown'})`;
      await loadThread();
      setMessage(messageMsg, '', '');
    } catch (error) {
      setMessage(messageMsg, error.message, 'error');
    }
  });
}

if (messageForm) {
  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!selectedMember) {
      setMessage(messageMsg, 'Select a member before sending a message.', 'error');
      return;
    }

    const text = messageInput.value.trim();
    if (!text) {
      setMessage(messageMsg, 'Message cannot be empty.', 'error');
      return;
    }

    try {
      await api('/api/messages', {
        method: 'POST',
        body: { toUserId: selectedMember.id, text },
      });

      messageInput.value = '';
      setMessage(messageMsg, 'Message sent.', 'success');
      await loadThread();
    } catch (error) {
      setMessage(messageMsg, error.message, 'error');
    }
  });
}

refreshSession();
setInterval(() => {
  if (authToken && selectedMember) {
    loadThread().catch(() => {});
  }
}, 5000);
