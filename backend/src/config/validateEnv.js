/**
 * src/config/validateEnv.js
 *
 * Проверяет наличие и корректность переменных окружения ДО старта сервера.
 * Если что-то не так — выводит понятную ошибку и завершает процесс.
 * Лучше упасть сразу с объяснением, чем молча падать потом в рантайме.
 */

const RULES = [
  // [ имя переменной, обязательная?, валидатор, подсказка ]
  {
    key:  'JWT_SECRET',
    required: true,
    validate: (v) => v.length >= 32,
    hint: 'Минимум 32 символа. Сгенерируй: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
  {
    key:  'JWT_SECRET',
    required: true,
    validate: (v) => v !== 'change_this_to_a_long_random_secret_string',
    hint: 'Замени placeholder в .env на настоящий секрет!',
  },
  {
    key:  'DB_HOST',
    required: true,
    hint: 'Укажи хост PostgreSQL (например: localhost или postgres)',
  },
  {
    key:  'DB_NAME',
    required: true,
    hint: 'Укажи имя базы данных',
  },
  {
    key:  'DB_USER',
    required: true,
    hint: 'Укажи пользователя PostgreSQL',
  },
  {
    key:  'DB_PASSWORD',
    required: true,
    hint: 'Укажи пароль PostgreSQL',
  },
  {
    key:  'PORT',
    required: false,
    validate: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) < 65536,
    hint: 'PORT должен быть числом от 1 до 65535',
  },
  {
    key:  'MAX_FILE_SIZE',
    required: false,
    validate: (v) => !isNaN(Number(v)) && Number(v) > 0,
    hint: 'MAX_FILE_SIZE должен быть числом в байтах (например: 20971520)',
  },
];

module.exports = function validateEnv() {
  const errors = [];

  for (const rule of RULES) {
    const value = process.env[rule.key];

    // Переменная отсутствует или пустая
    if (!value || value.trim() === '') {
      if (rule.required) {
        errors.push(`  ❌  ${rule.key} не задана\n      → ${rule.hint}`);
      }
      continue;
    }

    // Кастомная валидация
    if (rule.validate && !rule.validate(value)) {
      errors.push(`  ❌  ${rule.key} невалидна\n      → ${rule.hint}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════╗');
    console.error('║         ОШИБКА КОНФИГУРАЦИИ — сервер не запущен      ║');
    console.error('╚══════════════════════════════════════════════════════╝\n');
    errors.forEach(e => console.error(e + '\n'));
    console.error('Скопируй .env.example → .env и заполни все значения.\n');
    process.exit(1);
  }

  console.log('✅ Конфигурация окружения проверена');
};
