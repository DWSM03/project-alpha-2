const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// FIX: Create a function to get EVENT_FILE that checks env every time
function getEventFile() {
  return process.env.EVENT_FILE || path.join(__dirname, 'eventlist.txt');
}

// Middleware: parse JSON bodies and serve static frontend files from /public
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Metrics endpoint for performance monitoring
app.get('/metrics', (req, res) => {
  try {
    const tasks = readProjection();
    const metrics = {
      total_tasks: tasks.length,
      priority_tasks: tasks.filter(t => t.priority).length,
      regular_tasks: tasks.filter(t => !t.priority).length,
      tasks_with_dates: tasks.filter(t => t.date && t.date !== '').length,
      tasks_with_descriptions: tasks.filter(t => t.description && t.description !== '').length,
      server_timestamp: new Date().toISOString(),
      server_uptime: process.uptime()
    };
    res.json(metrics);
  } catch (e) {
    console.error('Metrics error:', e);
    res.status(500).json({ error: 'Failed to get metrics: ' + e.message });
  }
});

// Utility: generate a short unique id for tasks
function makeId() {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `t_${Date.now().toString(36)}_${rand}`;
}

// Ensure event storage file exists (simple file-backed append-only log)
function ensureEventFile() {
  const eventFile = getEventFile();
  if (!fs.existsSync(eventFile)) {
    fs.writeFileSync(eventFile, '', { encoding: 'utf-8' });
  }
}

// Append an event (create/delete) to the event log
function appendEvent(evtObj) {
  ensureEventFile();
  const eventFile = getEventFile();
  const line = JSON.stringify(evtObj) + '\n';
  fs.appendFileSync(eventFile, line, { encoding: 'utf-8' });
}

// Read projection: rebuild current task list by replaying events
function readProjection() {
  ensureEventFile();
  const eventFile = getEventFile();
  
  try {
    const data = fs.readFileSync(eventFile, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    const tasks = new Map();

    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        if (evt.type === 'create') {
          tasks.set(evt.id, {
            id: evt.id,
            name: evt.name,
            date: evt.date || '',
            time: evt.time || '',
            description: evt.description || '',
            priority: !!evt.priority,
            createdAt: evt.createdAt || new Date().toISOString()
          });
        } else if (evt.type === 'delete') {
          tasks.delete(evt.id);
        }
      } catch (parseError) {
        console.log('Skipping invalid line:', line);
      }
    }
    return Array.from(tasks.values());
  } catch (error) {
    console.error('Error reading projection:', error);
    return [];
  }
}

// API: GET /api/tasks
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = readProjection();
    res.json({ ok: true, tasks });
  } catch (e) {
    console.error('API tasks error:', e);
    res.status(500).json({ ok: false, error: 'Failed to read tasks.' });
  }
});

// API: POST /api/tasks
app.post('/api/tasks', (req, res) => {
  try {
    const { name, date, time, description, priority } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' });
    const id = makeId();
    const isPriority = !!priority;

    const evt = {
      type: 'create',
      id,
      name: String(name).trim(),
      date: isPriority ? '' : (date ? String(date) : ''),
      time: isPriority ? '' : (time ? String(time) : ''),
      description: description ? String(description) : '',
      priority: isPriority,
      createdAt: new Date().toISOString()
    };
    
    appendEvent(evt);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error('API create task error:', e);
    res.status(500).json({ ok: false, error: 'Failed to create task.' });
  }
});

// API: DELETE /api/tasks/:id
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, error: 'Task ID required.' });
    appendEvent({ type: 'delete', id, deletedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) {
    console.error('API delete task error:', e);
    res.status(500).json({ ok: false, error: 'Failed to delete task.' });
  }
});

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});

// SPA fallback (only for non-API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Only start the server if this file is run directly (not when imported for tests)
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Task Tracker v1.2 listening on http://0.0.0.0:${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`📈 Metrics: http://0.0.0.0:${PORT}/metrics`);
    console.log(`🎯 Frontend: http://0.0.0.0:${PORT}/`);
  });

  // Graceful shutdown for Render
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Task Tracker process terminated');
      process.exit(0);
    });
  });
}

module.exports = app;
