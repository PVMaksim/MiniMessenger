/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/init.sql',
  ],
  coverageReporters: ['text', 'lcov'],
  // Каждый тест-файл получает чистые моки
  clearMocks: true,
  resetMocks: true,
};
