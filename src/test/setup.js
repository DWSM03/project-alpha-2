// Test setup file - runs before each test
beforeEach(() => {
  // Clear the module cache to ensure fresh imports
  jest.resetModules();
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.EVENT_FILE = require('path').join(__dirname, '../../test-eventlist.txt');
});

afterAll(() => {
  // Clean up any test files
  const testEventFile = require('path').join(__dirname, '../../test-eventlist.txt');
  const fs = require('fs');
  if (fs.existsSync(testEventFile)) {
    fs.unlinkSync(testEventFile);
  }
});
