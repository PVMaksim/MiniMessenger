import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ Замени на IP своего Mac в локальной сети (ifconfig | grep inet)
// Например: http://192.168.1.100:4000
export const BASE_URL = 'http://192.168.31.207:4000';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('mm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove(['mm_token', 'mm_user']);
    }
    return Promise.reject(err);
  }
);

export default api;
