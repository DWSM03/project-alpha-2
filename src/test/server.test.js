const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Clear module cache and set environment BEFORE importing app
function getFreshApp() {
  // Clear the module cache for server.js
  delete require.cache[require.resolve('../../server')];
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.EVENT_FILE = path.join(__dirname, '../../test-eventlist.txt');
  
  // Import fresh app instance
  return require('../../server');
}

describe('Task Tracker API - Version 1.2', () => {
  let app;
  let TEST_EVENT_FILE;

  beforeEach(() => {
    // Get fresh app instance for each test
    app = getFreshApp();
    TEST_EVENT_FILE = process.env.EVENT_FILE;
    
    // Ensure test file is completely clean
    if (fs.existsSync(TEST_EVENT_FILE)) {
      fs.unlinkSync(TEST_EVENT_FILE);
    }
    // Recreate empty file
    fs.writeFileSync(TEST_EVENT_FILE, '', { encoding: 'utf-8' });
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(TEST_EVENT_FILE)) {
      fs.unlinkSync(TEST_EVENT_FILE);
    }
  });

  describe('Health and Metrics Endpoints', () => {
    test('GET /health should return server status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
    });

    test('GET /metrics should return task statistics', async () => {
      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body.total_tasks).toBe(0);
    });
  });

  describe('Task Management - Isolated Tests', () => {
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
          description: 'Test description',
          priority: false
        });
      
      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.id).toBeDefined();

      // Verify task was created correctly
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(1);
      
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
      expect(tasksResponse.body.tasks).toHaveLength(1);
      
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
        .send({ 
          name: 'Task to delete',
          priority: false 
        });
      
      const taskId = createResponse.body.id;
      
      // Verify it exists (should be the only task)
      const initialTasks = await request(app).get('/api/tasks');
      expect(initialTasks.body.tasks).toHaveLength(1);
      expect(initialTasks.body.tasks[0].id).toBe(taskId);
      
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
      
      expect(response.status).toBe(200);
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

  describe('Task Priority Rules - Isolated', () => {
    test('Priority tasks should not have date/time', async () => {
      await request(app)
        .post('/api/tasks')
        .send({
          name: 'Priority Test',
          date: '2024-12-31',
          time: '23:59',
          priority: true
        });
      
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(1);
      
      const task = tasksResponse.body.tasks[0];
      expect(task.priority).toBe(true);
      expect(task.date).toBe('');
      expect(task.time).toBe('');
    });

    test('Regular tasks should preserve date/time', async () => {
      await request(app)
        .post('/api/tasks')
        .send({
          name: 'Regular Test',
          date: '2024-12-31',
          time: '23:59',
          priority: false
        });
      
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(1);
      
      const task = tasksResponse.body.tasks[0];
      expect(task.priority).toBe(false);
      expect(task.date).toBe('2024-12-31');
      expect(task.time).toBe('23:59');
    });
  });

  describe('Data Persistence - Isolated', () => {
    test('Tasks should persist between API calls', async () => {
      // Create a task
      await request(app)
        .post('/api/tasks')
        .send({ name: 'Persistent Task', priority: false });
      
      // Verify it exists in first call
      const response1 = await request(app).get('/api/tasks');
      expect(response1.body.tasks).toHaveLength(1);
      
      // Verify it still exists in second call
      const response2 = await request(app).get('/api/tasks');
      expect(response2.body.tasks).toHaveLength(1);
      expect(response2.body.tasks[0].name).toBe('Persistent Task');
    });
  });
});
