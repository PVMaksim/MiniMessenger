// __mocks__/db.js
// Мок для src/config/db.js
// Каждый тест переопределяет db.query через jest.fn()

const db = {
  query:   jest.fn(),
  connect: jest.fn(),
};

// connect() возвращает клиент с query / release / BEGIN / COMMIT / ROLLBACK
db.connect.mockResolvedValue({
  query:   jest.fn(),
  release: jest.fn(),
});

module.exports = db;
