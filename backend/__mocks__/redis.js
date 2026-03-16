// __mocks__/redis.js
// Мок для src/config/redis.js

const redis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
};

module.exports = redis;
