/* 
  Frontend logic - Version 1.2
  - Theme switcher (red/blue/green) persisted in localStorage.
  - Priority tasks: checkbox disables date/time; appear at top of Dashboard.
  - v1.0 behaviors intact (notifications for dated tasks, delete, polling).
*/

const scheduledList = document.getElementById('scheduledList');
const dashboardList = document.getElementById('dashboardList');
const form = document.getElementById('taskForm');
const themeSelect = document.getElementById('themeSelect');
const priorityCheckbox = document.getElementById('priority');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');

const notified = new Set();

/** Theme initialization and persistence */
(function initTheme() {
  const stored = localStorage.getItem('theme') || 'blue';
  document.documentElement.setAttribute('data-theme', stored);
  if (themeSelect) themeSelect.value = stored;
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const val = themeSelect.value;
      document.documentElement.setAttribute('data-theme', val);
      localStorage.setItem('theme', val);
    });
  }
})();

/** Priority UI behavior: disable/clear date/time when checked */
(function initPriorityToggle() {
  function apply() {
    const on = priorityCheckbox.checked;
    dateInput.disabled = on;
    timeInput.disabled = on;
    if (on) {
      dateInput.value = '';
      timeInput.value = '';
    }
  }
  if (priorityCheckbox) {
    priorityCheckbox.addEventListener('change', apply);
    apply();
  }
})();

/** Notifications permission 
if ('Notification' in window) {
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}*/

function taskDueTs(task) {
  if (!task.date || !task.time) return NaN;
  const [y, m, d] = task.date.split('-').map(Number);
  const [hh, mm] = task.time.split(':').map(Number);
  const dt = new Date(y, (m - 1), d, hh || 0, mm || 0, 0, 0);
  return dt.getTime();
}

function render(tasks) {
  scheduledList.innerHTML = '';
  dashboardList.innerHTML = '';

  const now = Date.now();
  const scheduled = [];
  const active = [];
  const priority = [];

  for (const t of tasks) {
    if (t.priority) {
      // Priority tasks are always active and pinned
      priority.push(t);
      continue;
    }
    const due = taskDueTs(t);
    if (Number.isNaN(due)) {
      active.push(t);
      continue;
    }
    if (due > now) scheduled.push(t);
    else active.push(t);
  }

  // Sort groups:
  scheduled.sort((a, b) => (taskDueTs(a) || Infinity) - (taskDueTs(b) || Infinity));
  active.sort((a, b) => (taskDueTs(b) || 0) - (taskDueTs(a) || 0));
  // Priority group could be sorted by createdAt desc for visibility
  priority.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Render scheduled (non-priority & future)
  for (const t of scheduled) scheduledList.appendChild(taskItem(t, false));

  // Render dashboard: priority first, then the rest
  for (const t of priority) dashboardList.appendChild(taskItem(t, true));
  for (const t of active) dashboardList.appendChild(taskItem(t, true));
}

function taskItem(task, isActive) {
  const li = document.createElement('li');
  li.className = 'task';

  const left = document.createElement('div');
  const right = document.createElement('div');
  right.className = 'controls';

  const title = document.createElement('div');
  title.className = 'title';

  if (task.priority) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'PRIORITY';
    title.appendChild(badge);
  }

  const titleText = document.createElement('span');
  titleText.textContent = task.name;
  title.appendChild(titleText);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const dateStr = task.date ? `Date: ${task.date}` : 'No date';
  const timeStr = task.time ? `Time: ${task.time}` : 'No time';
  meta.textContent = `${dateStr} • ${timeStr} • ID: ${task.id}`;

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = task.description || '';

  left.appendChild(title);
  left.appendChild(meta);
  if (task.description) left.appendChild(desc);

  if (isActive) {
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      if (!confirm('Delete this task?')) return;
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
      await loadAndRender();
    };
    right.appendChild(delBtn);
  }

  li.appendChild(left);
  li.appendChild(right);
  return li;
}

async function loadAndRender() {
  const res = await fetch('/api/tasks');
  const data = await res.json();
  if (!data.ok) {
    alert('Failed to load tasks.');
    return;
  }

  const tasks = data.tasks || [];
  render(tasks);

  const now = Date.now();
  for (const t of tasks) {
    if (t.priority) continue; // no due-time notifications for priority tasks
    const due = taskDueTs(t);
    if (Number.isNaN(due)) continue;
    if (due <= now && !notified.has(t.id)) {
      notified.add(t.id);
      notify(`Task due: ${t.name}`, t.description || '');
    }
  }
}

function notify(title, body = '') {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else {
    alert(`${title}\n${body}`.trim());
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  const payload = {
    name: formData.get('name'),
    date: formData.get('date'),
    time: formData.get('time'),
    priority: formData.get('priority') === 'on',
    description: formData.get('description')
  };
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    alert(data.error || 'Failed to create task.');
    return;
  }
  form.reset();
  // Ensure inputs re-enable if the checkbox resets
  if (priorityCheckbox) priorityCheckbox.checked = false;
  if (dateInput) dateInput.disabled = false;
  if (timeInput) timeInput.disabled = false;
  await loadAndRender();
});

loadAndRender();
setInterval(loadAndRender, 20000);
