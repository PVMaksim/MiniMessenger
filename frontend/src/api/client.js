import axios from 'axios';

const api = axios.create({ baseURL: '/' });

// Автоматически добавляем токен в заголовок
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Если 401 — сбрасываем сессию
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mm_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
