// Test setup file - runs before each test
const path = require('path');
const fs = require('fs');

beforeEach(() => {
  // Clear the module cache to ensure fresh imports
  jest.resetModules();
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.EVENT_FILE = path.join(__dirname, '../../test-eventlist.txt');
  
  // Ensure test file is clean
  const testEventFile = process.env.EVENT_FILE;
  if (fs.existsSync(testEventFile)) {
    fs.unlinkSync(testEventFile);
  }
});

afterAll(() => {
  // Final cleanup
  const testEventFile = path.join(__dirname, '../../test-eventlist.txt');
  if (fs.existsSync(testEventFile)) {
    fs.unlinkSync(testEventFile);
  }
});
