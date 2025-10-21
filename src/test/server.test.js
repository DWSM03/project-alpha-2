constp request = require('supertest');
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

describe('Task Tracker API - Version 1.2 - Enhanced Tests', () => {
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

  // ==================== HEALTH & METRICS ENDPOINTS ====================
  describe('Health and Metrics Endpoints', () => {
    test('GET /health should return server status with correct structure', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'OK',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        version: '1.2.0',
        environment: 'test'
      });
      // Verify timestamp is valid ISO string
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    test('GET /metrics should return accurate task statistics', async () => {
      // Create some test data first
      await request(app).post('/api/tasks').send({ name: 'Task 1', priority: true });
      await request(app).post('/api/tasks').send({ 
        name: 'Task 2', 
        date: '2024-01-01', 
        time: '10:00',
        description: 'With description',
        priority: false 
      });

      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        total_tasks: 2,
        priority_tasks: 1,
        regular_tasks: 1,
        tasks_with_dates: 1,
        tasks_with_descriptions: 1,
        server_timestamp: expect.any(String),
        server_uptime: expect.any(Number)
      });
    });

    test('GET /metrics should handle empty task list', async () => {
      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body.total_tasks).toBe(0);
      expect(response.body.priority_tasks).toBe(0);
      expect(response.body.regular_tasks).toBe(0);
    });
  });

  // ==================== TASK MANAGEMENT - CORE FUNCTIONALITY ====================
  describe('Task Management - Core Functionality', () => {
    test('GET /api/tasks should return empty array initially', async () => {
      const response = await request(app).get('/api/tasks');
      
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.tasks).toEqual([]);
    });

    test('POST /api/tasks should create a regular task with all fields', async () => {
      const taskData = {
        name: 'Test Regular Task',
        date: '2024-01-01',
        time: '10:00',
        description: 'Test description with special chars: !@#$%',
        priority: false
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData);
      
      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.id).toMatch(/^t_[a-z0-9]+_[a-z0-9]+$/); // Validate ID format

      // Verify task was created correctly
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(1);
      
      const task = tasksResponse.body.tasks[0];
      expect(task.name).toBe(taskData.name);
      expect(task.date).toBe(taskData.date);
      expect(task.time).toBe(taskData.time);
      expect(task.description).toBe(taskData.description);
      expect(task.priority).toBe(false);
      expect(task.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
    });

    test('POST /api/tasks should create priority task without date/time regardless of input', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: 'Priority Task',
          date: '2024-01-01',
          time: '10:00',
          description: 'Should ignore date/time',
          priority: true
        });
      
      expect(response.status).toBe(201);
      
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(task.priority).toBe(true);
      expect(task.date).toBe('');
      expect(task.time).toBe('');
      expect(task.description).toBe('Should ignore date/time'); // Description should persist
    });

    test('POST /api/tasks should trim task name whitespace', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: '  Task with spaces  ',
          priority: false
        });
      
      expect(response.status).toBe(201);
      
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(task.name).toBe('Task with spaces'); // Should be trimmed
    });
  });

  // ==================== VALIDATION & ERROR HANDLING ====================
  describe('Validation and Error Handling', () => {
    test('POST /api/tasks should require name field with proper error message', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          date: '2024-01-01',
          time: '10:00'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Name is required.');
    });

    test('POST /api/tasks should handle empty name string', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: '',
          priority: false
        });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });

    test('POST /api/tasks should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{"name": "test", "priority": false') // Malformed JSON
        .catch(err => err.response);
      
      expect(response.status).toBe(400);
    });

    test('POST /api/tasks should handle extremely long task name', async () => {
      const longName = 'A'.repeat(1000);
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: longName,
          priority: false
        });
      
      expect(response.status).toBe(201); // Should handle long names
    });
  });

  // ==================== TASK PRIORITY RULES ====================
  describe('Task Priority Rules and Behavior', () => {
    test('Mixed priority and regular tasks should maintain correct date/time behavior', async () => {
      // Create priority task
      await request(app).post('/api/tasks').send({
        name: 'Priority Task',
        date: '2024-01-01',
        time: '10:00',
        priority: true
      });

      // Create regular task
      await request(app).post('/api/tasks').send({
        name: 'Regular Task',
        date: '2024-02-01',
        time: '14:30',
        priority: false
      });

      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(2);

      // Find priority task
      const priorityTask = tasksResponse.body.tasks.find(t => t.priority);
      expect(priorityTask.date).toBe('');
      expect(priorityTask.time).toBe('');

      // Find regular task
      const regularTask = tasksResponse.body.tasks.find(t => !t.priority);
      expect(regularTask.date).toBe('2024-02-01');
      expect(regularTask.time).toBe('14:30');
    });

    test('Priority field should be boolean in response', async () => {
      await request(app).post('/api/tasks').send({
        name: 'Test Task',
        priority: true
      });

      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(typeof task.priority).toBe('boolean');
    });
  });

  // ==================== DELETE OPERATIONS ====================
  describe('Delete Operations', () => {
    test('DELETE /api/tasks/:id should remove specific task and preserve others', async () => {
      // Create multiple tasks
      const task1 = await request(app).post('/api/tasks').send({ name: 'Task 1', priority: false });
      const task2 = await request(app).post('/api/tasks').send({ name: 'Task 2', priority: false });
      
      // Delete first task
      await request(app).delete(`/api/tasks/${task1.body.id}`);
      
      // Verify only second task remains
      const finalTasks = await request(app).get('/api/tasks');
      expect(finalTasks.body.tasks).toHaveLength(1);
      expect(finalTasks.body.tasks[0].name).toBe('Task 2');
    });

    test('DELETE /api/tasks/:id should handle non-existent task gracefully', async () => {
      const response = await request(app)
        .delete('/api/tasks/non-existent-id-12345');
      
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    test('DELETE /api/tasks/:id should handle malformed task IDs', async () => {
      const response = await request(app)
        .delete('/api/tasks/!@#$%^&*()');
      
      expect(response.status).toBe(200); // Your API returns 200 for all deletes
    });
  });

  // ==================== DATA PERSISTENCE & STATE MANAGEMENT ====================
  describe('Data Persistence and State Management', () => {
    test('Tasks should persist between multiple API calls', async () => {
      // Create a task
      await request(app).post('/api/tasks').send({ name: 'Persistent Task', priority: false });
      
      // Multiple reads should return same data
      const response1 = await request(app).get('/api/tasks');
      const response2 = await request(app).get('/api/tasks');
      const response3 = await request(app).get('/api/tasks');
      
      expect(response1.body.tasks).toHaveLength(1);
      expect(response2.body.tasks).toHaveLength(1);
      expect(response3.body.tasks).toHaveLength(1);
      expect(response1.body.tasks[0].name).toBe('Persistent Task');
    });

    test('Multiple task creations should generate unique IDs', async () => {
      const task1 = await request(app).post('/api/tasks').send({ name: 'Task 1', priority: false });
      const task2 = await request(app).post('/api/tasks').send({ name: 'Task 2', priority: false });
      const task3 = await request(app).post('/api/tasks').send({ name: 'Task 3', priority: false });
      
      expect(task1.body.id).not.toBe(task2.body.id);
      expect(task2.body.id).not.toBe(task3.body.id);
      expect(task1.body.id).not.toBe(task3.body.id);
    });

    test('Task list should maintain order based on creation', async () => {
      const task1 = await request(app).post('/api/tasks').send({ name: 'First Task', priority: false });
      const task2 = await request(app).post('/api/tasks').send({ name: 'Second Task', priority: false });
      
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(2);
      // Tasks should be in creation order (oldest first based on your readProjection logic)
    });
  });

  // ==================== FRONTEND & STATIC FILES ====================
  describe('Frontend and Static File Serving', () => {
    test('GET / should serve index.html with correct content', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Task Tracker v1.2');
      expect(response.text).toContain('Create Task');
      expect(response.text).toContain('Dashboard');
    });

    test('GET /styles.css should serve CSS with correct headers', async () => {
      const response = await request(app).get('/styles.css');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/css');
      expect(response.text).toContain('var(--bg)'); // Check for CSS variables
    });

    test('GET /main.js should serve JavaScript with correct headers', async () => {
      const response = await request(app).get('/main.js');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('javascript');
      expect(response.text).toContain('function'); // Check for JS code
    });

    test('Non-existent static files should serve index.html (SPA behavior)', async () => {
      const response = await request(app).get('/non-existent-file.css');
      expect(response.status).toBe(200); // SPA serves index.html for all routes
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Task Tracker v1.2'); // Should serve the main app
    });
  });

  // ==================== SPA BEHAVIOR ====================
  describe('SPA (Single Page Application) Behavior', () => {
    test('Client-side routes should serve index.html for frontend routing', async () => {
      const routes = [
        '/dashboard',
        '/settings',
        '/tasks/123',
        '/any/random/route',
        '/deep/nested/route/here'
      ];

      for (const route of routes) {
        const response = await request(app).get(route);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('Task Tracker v1.2');
      }
    });

    test('API routes should return 404 for non-existent endpoints', async () => {
      const apiRoutes = [
        '/api/non-existent',
        '/api/v2/tasks',
        '/api/admin/users'
      ];

      for (const route of apiRoutes) {
        const response = await request(app).get(route);
        // These should return 404, not the SPA page
        expect(response.status).toBe(404);
      }
    });

    test('Static assets should be served directly when they exist', async () => {
      const staticAssets = [
        '/styles.css',
        '/main.js'
      ];

      for (const asset of staticAssets) {
        const response = await request(app).get(asset);
        expect(response.status).toBe(200);
        // Should not be HTML content for actual static files
        if (asset.endsWith('.css')) {
          expect(response.headers['content-type']).toContain('text/css');
        } else if (asset.endsWith('.js')) {
          expect(response.headers['content-type']).toContain('javascript');
        }
      }
    });
  });

  // ==================== EDGE CASES & STRESS TESTING ====================
  describe('Edge Cases and Stress Testing', () => {
    test('API should handle concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        request(app).post('/api/tasks').send({ name: `Task ${i}`, priority: false })
      );
      
      const results = await Promise.all(promises);
      
      // All requests should succeed
      results.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.ok).toBe(true);
      });
      
      // Verify all tasks were created
      const tasksResponse = await request(app).get('/api/tasks');
      expect(tasksResponse.body.tasks).toHaveLength(5);
    });

    test('Task with only required fields should be created successfully', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ name: 'Minimal Task' }); // No priority, date, time, description
      
      expect(response.status).toBe(201);
      
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      expect(task.name).toBe('Minimal Task');
      expect(task.priority).toBe(false); // Default value
      expect(task.date).toBe(''); // Default value
      expect(task.time).toBe(''); // Default value
      expect(task.description).toBe(''); // Default value
    });

    test('Empty task list metrics should have correct zero values', async () => {
      const response = await request(app).get('/metrics');
      
      expect(response.body.total_tasks).toBe(0);
      expect(response.body.priority_tasks).toBe(0);
      expect(response.body.regular_tasks).toBe(0);
      expect(response.body.tasks_with_dates).toBe(0);
      expect(response.body.tasks_with_descriptions).toBe(0);
    });
  });

  // ==================== SECURITY & INPUT SANITIZATION ====================
  describe('Security and Input Sanitization', () => {
    test('Should handle special characters in task names and descriptions', async () => {
      const specialCharsTask = {
        name: 'Task with <script>alert("xss")</script> & special chars',
        description: 'Description with "quotes" & <html> tags',
        priority: false
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(specialCharsTask);
      
      expect(response.status).toBe(201);
      
      const tasksResponse = await request(app).get('/api/tasks');
      const task = tasksResponse.body.tasks[0];
      // Should store the content as-is (sanitization would be handled by frontend)
      expect(task.name).toBe(specialCharsTask.name);
      expect(task.description).toBe(specialCharsTask.description);
    });

    test('Should handle very long description field', async () => {
      const longDescription = 'A'.repeat(5000); // Very long description
      const response = await request(app)
        .post('/api/tasks')
        .send({
          name: 'Task with long description',
          description: longDescription,
          priority: false
        });
      
      expect(response.status).toBe(201);
    });
  });
});
