const request = require('supertest');
const app = require('../../server');
const fs = require('fs');
const path = require('path');

describe('Task Tracker API - Version 1.2', () => {
  const TEST_EVENT_FILE = path.join(__dirname, '../../test-eventlist.txt');
  
  beforeEach(() => {
    // Use test event file
    process.env.EVENT_FILE = TEST_EVENT_FILE;
    if (fs.existsSync(TEST_EVENT_FILE)) {
      fs.unlinkSync(TEST_EVENT_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_EVENT_FILE)) {
      fs.unlinkSync(TEST_EVENT_FILE);
    }
  });

  describe('Health and Metrics Endpoints', () => {
    test('GET /health should return server status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.uptime).toBeDefined();
      expect(response.body.version).toBe('1.2.0');
    });

    test('GET /metrics should return task statistics', async () => {
      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body.total_tasks).toBeDefined();
      expect(response.body.priority_tasks).toBeDefined();
      expect(response.body.regular_tasks).toBeDefined();
    });
  });

  describe('Task Management', () => {
    test('GET /api/tasks should return empty array initially', async () => {
      const response = await request(app).get('/api/tasks');
      
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.tasks).toEqual([]);
    });

    test('POST /api/tasks should create a regular task', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: 'Test Regular Task',
          date: '2024-01-01',
          time: '10:00',
          description: 'Test description'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.id).toBeDefined();

      // Verify task was created correctly
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(task.name).toBe('Test Regular Task');
      expect(task.date).toBe('2024-01-01');
      expect(task.time).toBe('10:00');
      expect(task.priority).toBe(false);
    });

    test('POST /api/tasks should create priority task without date/time', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: 'Priority Task',
          date: '2024-01-01',
          time: '10:00',
          priority: true
        });
      
      expect(response.status).toBe(201);
      
      // Check that priority task has blank date/time
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(task.priority).toBe(true);
      expect(task.date).toBe('');
      expect(task.time).toBe('');
    });

    test('POST /api/tasks should require name field', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          date: '2024-01-01',
          time: '10:00'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('Name is required');
    });

    test('DELETE /api/tasks/:id should remove task', async () => {
      // Create a task first
      const createResponse = await request(app)
        .post('/api/tasks')
        .send({ name: 'Task to delete' });
      
      const taskId = createResponse.body.id;
      
      // Verify it exists
      const initialTasks = await request(app).get('/api/tasks');
      expect(initialTasks.body.tasks).toHaveLength(1);
      
      // Delete the task
      const deleteResponse = await request(app)
        .delete(`/api/tasks/${taskId}`);
      
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.ok).toBe(true);
      
      // Verify it's gone
      const finalTasks = await request(app).get('/api/tasks');
      expect(finalTasks.body.tasks).toHaveLength(0);
    });

    test('DELETE /api/tasks/:id should handle non-existent task', async () => {
      const response = await request(app)
        .delete('/api/tasks/non-existent-id');
      
      expect(response.status).toBe(200); // Your API returns 200 even for non-existent
      expect(response.body.ok).toBe(true);
    });
  });

  describe('Frontend Static Files', () => {
    test('GET / should serve index.html', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Task Tracker v1.2');
    });

    test('GET /styles.css should serve CSS', async () => {
      const response = await request(app).get('/styles.css');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/css');
    });

    test('GET /main.js should serve JavaScript', async () => {
      const response = await request(app).get('/main.js');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('javascript');
    });
  });
});
