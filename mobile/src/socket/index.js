import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../api/client';

let socket = null;

export async function getSocket() {
  if (!socket) {
    const token = await AsyncStorage.getItem('mm_token');
    socket = io(BASE_URL, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

export async function connectSocket() {
  const s = await getSocket();
  s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
