const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const EVENT_FILE = process.env.EVENT_FILE || path.join(__dirname, 'eventlist.txt');

// Middleware: parse JSON bodies and serve static frontend files from /public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// ... REST OF YOUR EXISTING server.js CODE ...
// (makeId, ensureEventFile, appendEvent, readProjection, and your API routes remain the same)

// Start server - important for Render deployment
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
