import { io } from 'socket.io-client';

let socket = null;

export function getSocket(token) {
  if (!socket) {
    socket = io('/', {
      auth: { token: token || localStorage.getItem('mm_token') },
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
