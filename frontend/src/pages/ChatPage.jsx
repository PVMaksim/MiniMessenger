import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { getSocket, connectSocket, disconnectSocket } from '../socket';

// ─── Анимированный индикатор «печатает» ──────────────────────────────────────
function TypingBubble({ names }) {
  if (!names.length) return null;
  const label = names.length === 1
    ? `${names[0]} печатает`
    : `${names.join(', ')} печатают`;

  return (
    <div style={s.typingBubble}>
      <span style={s.typingText}>{label}</span>
      <span style={s.typingDots}>
        <span style={{ ...s.dot, animationDelay: '0ms'   }} />
        <span style={{ ...s.dot, animationDelay: '160ms' }} />
        <span style={{ ...s.dot, animationDelay: '320ms' }} />
      </span>
    </div>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export default function ChatPage() {
  const navigate = useNavigate();
  const me = JSON.parse(localStorage.getItem('mm_user') || '{}');

  const [chats,        setChats]        = useState([]);
  const [activeChat,   setActiveChat]   = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [onlineUsers,  setOnlineUsers]  = useState(new Set());
  // typingUsers: { [userId]: { username, chatId } }  — с привязкой к чату
  const [typingUsers,  setTypingUsers]  = useState({});
  const [newChatInput, setNewChatInput] = useState('');
  const [newChatError, setNewChatError] = useState('');
  const [showNewChat,  setShowNewChat]  = useState(false);
  const [uploading,    setUploading]    = useState(false);

  const activeChatRef  = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);   // ← FIX: был не объявлен, crash при вводе

  // Синхронизируем ref с state (нужен в замыканиях сокета)
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // ─── Загрузка чатов ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/chats').then(r => setChats(r.data)).catch(console.error);
  }, []);

  // ─── Сокет ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token  = localStorage.getItem('mm_token');
    const socket = getSocket(token);
    connectSocket();

    socket.off('user:online');
    socket.off('user:offline');
    socket.off('message:new');
    socket.off('typing:start');
    socket.off('typing:stop');

    socket.on('user:online',  ({ userId }) =>
      setOnlineUsers(s => new Set([...s, userId])));

    socket.on('user:offline', ({ userId }) =>
      setOnlineUsers(s => { const n = new Set(s); n.delete(userId); return n; }));

    socket.on('message:new', (msg) => {
      // Добавляем в список сообщений только если открыт нужный чат
      setMessages(prev =>
        activeChatRef.current?.id === msg.chat_id ? [...prev, msg] : prev
      );
      // Обновляем превью в сайдбаре
      setChats(prev => prev.map(c => c.id === msg.chat_id
        ? { ...c, last_message: msg.content || '📎', last_message_at: msg.created_at }
        : c
      ));
      // Если пришло сообщение — человек перестал «печатать»
      setTypingUsers(t => { const n = { ...t }; delete n[msg.sender_id]; return n; });
    });

    // FIX: сохраняем chatId в момент события, чтобы не показывать
    // «печатает» из другого чата при переключении
    socket.on('typing:start', ({ userId, username }) => {
      const chatId = activeChatRef.current?.id;
      if (!chatId) return;
      setTypingUsers(t => ({ ...t, [userId]: { username, chatId } }));
    });

    socket.on('typing:stop', ({ userId }) => {
      setTypingUsers(t => { const n = { ...t }; delete n[userId]; return n; });
    });

    return () => disconnectSocket();
  }, []);

  // ─── Выбор чата ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChat) return;
    // Сбрасываем «печатает» при смене чата
    setTypingUsers({});
    const socket = getSocket();
    socket.emit('chat:join', activeChat.id);
    api.get(`/chats/${activeChat.id}/messages`).then(r => setMessages(r.data)).catch(console.error);
  }, [activeChat]);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Отправка текста ────────────────────────────────────────────────────
  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim() || !activeChat) return;
    const socket = getSocket();
    socket.emit('message:send', { chatId: activeChat.id, content: text.trim() });
    socket.emit('typing:stop',  { chatId: activeChat.id });
    clearTimeout(typingTimerRef.current);
    setText('');
  };

  // ─── Ввод текста + «печатает» ────────────────────────────────────────────
  const handleTyping = (e) => {
    setText(e.target.value);
    if (!activeChat) return;
    const socket = getSocket();
    socket.emit('typing:start', { chatId: activeChat.id });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit('typing:stop', { chatId: activeChat.id });
    }, 1500);
  };

  // ─── Загрузка файла ─────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeChat) return;
    e.target.value = '';
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const socket = getSocket();
      socket.emit('message:send', {
        chatId:   activeChat.id,
        content:  null,
        fileUrl:  data.url,
        fileName: data.name,
        fileType: data.type,
      });
    } catch (err) {
      alert('Не удалось загрузить файл');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // ─── Новый чат ───────────────────────────────────────────────────────────
  const handleNewChat = async (e) => {
    e.preventDefault();
    setNewChatError('');
    try {
      const { data } = await api.post('/chats', { partner_username: newChatInput.trim() });
      if (!data.already_exists) setChats(prev => [data, ...prev]);
      setActiveChat(data);
      setShowNewChat(false);
      setNewChatInput('');
    } catch (err) {
      setNewChatError(err.response?.data?.error || 'Ошибка');
    }
  };

  const logout = () => {
    localStorage.clear();
    disconnectSocket();
    navigate('/login');
  };

  // ─── Вычислялки ──────────────────────────────────────────────────────────
  const chatName   = (chat) => chat.is_group ? chat.name : (chat.partner_display_name || chat.partner_username);
  const chatOnline = (chat) => !chat.is_group && onlineUsers.has(chat.partner_id);

  // Только те, кто печатает в ТЕКУЩЕМ чате и это не я
  const typingNames = Object.values(typingUsers)
    .filter(u => u.chatId === activeChat?.id && u.username !== me.username)
    .map(u => u.username);

  // Строка статуса в шапке
  const headerStatus = uploading
    ? '⏳ Загрузка файла...'
    : typingNames.length > 0
      ? null  // вместо текста покажем TypingBubble
      : chatOnline(activeChat)
        ? '🟢 онлайн'
        : '';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.app}>

      {/* ── Боковая панель ── */}
      <aside style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <div>
            <div style={s.myName}>{me.display_name || me.username}</div>
            <div style={s.myTag}>@{me.username}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.iconBtn} onClick={() => setShowNewChat(v => !v)} title="Новый чат">✏️</button>
            <button style={s.iconBtn} onClick={logout} title="Выйти">🚪</button>
          </div>
        </div>

        {showNewChat && (
          <form onSubmit={handleNewChat} style={s.newChatForm}>
            <input
              style={s.newChatInput}
              placeholder="Логин собеседника"
              value={newChatInput}
              onChange={e => setNewChatInput(e.target.value)}
              autoFocus
            />
            {newChatError && <div style={s.newChatError}>{newChatError}</div>}
            <button style={s.newChatBtn} type="submit">Открыть чат</button>
          </form>
        )}

        <div style={s.chatList}>
          {chats.length === 0 && (
            <div style={s.empty}>Нет чатов. Нажми ✏️ чтобы начать</div>
          )}
          {chats.map(chat => (
            <div
              key={chat.id}
              style={{ ...s.chatItem, ...(activeChat?.id === chat.id ? s.chatItemActive : {}) }}
              onClick={() => setActiveChat(chat)}
            >
              <div style={s.avatar}>
                {chatName(chat)?.[0]?.toUpperCase() || '?'}
                {chatOnline(chat) && <span style={s.onlineDot} />}
              </div>
              <div style={s.chatInfo}>
                <div style={s.chatName}>{chatName(chat)}</div>
                <div style={s.lastMsg}>{chat.last_message || 'Нет сообщений'}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Область переписки ── */}
      <main style={s.main}>
        {!activeChat ? (
          <div style={s.noChat}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ marginTop: 12, color: '#888' }}>Выбери чат или начни новый</div>
          </div>
        ) : (
          <>
            {/* Шапка чата */}
            <div style={s.chatHeader}>
              <div style={s.avatar}>{chatName(activeChat)?.[0]?.toUpperCase()}</div>
              <div>
                <div style={s.chatHeaderName}>{chatName(activeChat)}</div>
                {typingNames.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: '#4f46e5' }}>
                      {typingNames.length === 1
                        ? `${typingNames[0]} печатает`
                        : `${typingNames.join(', ')} печатают`}
                    </span>
                    <AnimatedDots color="#4f46e5" />
                  </div>
                ) : (
                  <div style={s.chatHeaderStatus}>{headerStatus}</div>
                )}
              </div>
            </div>

            {/* Список сообщений */}
            <div style={s.messages}>
              {messages.map(msg => {
                const isMine = msg.sender_id === me.id;
                return (
                  <div key={msg.id} style={{ ...s.msgRow, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    {!isMine && (
                      <div style={s.msgAvatar}>{msg.sender_display_name?.[0]?.toUpperCase()}</div>
                    )}
                    <div style={{ ...s.bubble, ...(isMine ? s.bubbleMine : s.bubbleOther) }}>
                      {!isMine && <div style={s.senderName}>{msg.sender_display_name}</div>}
                      {msg.file_url && msg.file_type?.startsWith('image/') ? (
                        <img src={msg.file_url} alt={msg.file_name} style={s.msgImage} />
                      ) : msg.file_url ? (
                        <a href={msg.file_url} style={s.fileLink} target="_blank" rel="noreferrer">
                          📎 {msg.file_name}
                        </a>
                      ) : null}
                      {msg.content && <div>{msg.content}</div>}
                      <div style={s.msgTime}>
                        {new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Пузырь «печатает» в потоке сообщений */}
              <TypingBubble names={typingNames} />

              <div ref={messagesEndRef} />
            </div>

            {/* Строка ввода */}
            <form onSubmit={handleSend} style={s.inputRow}>
              <label style={s.attachBtn} title="Прикрепить файл">
                📎
                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept="*/*" />
              </label>
              <input
                style={s.textInput}
                placeholder="Сообщение..."
                value={text}
                onChange={handleTyping}
              />
              <button style={{ ...s.sendBtn, opacity: text.trim() ? 1 : 0.4 }} type="submit" disabled={!text.trim()}>
                ➤
              </button>
            </form>
          </>
        )}
      </main>

      {/* CSS-анимация для точек */}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0);   opacity: 0.4; }
          30%            { transform: translateY(-5px); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ─── Три прыгающие точки (используется в шапке) ──────────────────────────────
function AnimatedDots({ color = '#4f46e5' }) {
  const dot = {
    display: 'inline-block',
    width: 4, height: 4,
    borderRadius: '50%',
    background: color,
    margin: '0 1.5px',
    animation: 'typingBounce 1s infinite',
    verticalAlign: 'middle',
  };
  return (
    <span>
      <span style={{ ...dot, animationDelay: '0ms'   }} />
      <span style={{ ...dot, animationDelay: '160ms' }} />
      <span style={{ ...dot, animationDelay: '320ms' }} />
    </span>
  );
}

// ─── Пузырь «печатает» в потоке сообщений ────────────────────────────────────
function TypingBubble({ names }) {
  if (!names.length) return null;
  return (
    <div style={s.typingRow}>
      <div style={s.msgAvatar}>{names[0][0].toUpperCase()}</div>
      <div style={s.typingBubble}>
        <span style={s.dot1} />
        <span style={s.dot2} />
        <span style={s.dot3} />
      </div>
    </div>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────
const dotBase = {
  display: 'inline-block',
  width: 7, height: 7,
  borderRadius: '50%',
  background: '#aaa',
  margin: '0 2px',
  animation: 'typingBounce 1s infinite',
};

const s = {
  app:             { display: 'flex', height: '100vh', background: '#f0f2f5' },
  // Sidebar
  sidebar:         { width: 300, background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column' },
  sidebarHeader:   { padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  myName:          { fontWeight: 700, fontSize: 15 },
  myTag:           { fontSize: 12, color: '#aaa' },
  iconBtn:         { border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', padding: 4, borderRadius: 6 },
  newChatForm:     { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 6 },
  newChatInput:    { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  newChatError:    { color: '#dc2626', fontSize: 12 },
  newChatBtn:      { padding: '8px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, cursor: 'pointer' },
  chatList:        { flex: 1, overflowY: 'auto' },
  empty:           { padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 },
  chatItem:        { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' },
  chatItemActive:  { background: '#eef2ff' },
  chatInfo:        { flex: 1, overflow: 'hidden' },
  chatName:        { fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  lastMsg:         { fontSize: 12, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  // Avatar
  avatar:          { width: 40, height: 40, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0, position: 'relative' },
  onlineDot:       { position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' },
  // Main
  main:            { flex: 1, display: 'flex', flexDirection: 'column' },
  noChat:          { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  chatHeader:      { padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 12 },
  chatHeaderName:  { fontWeight: 700, fontSize: 16 },
  chatHeaderStatus:{ fontSize: 12, color: '#888', marginTop: 2 },
  messages:        { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 },
  msgRow:          { display: 'flex', alignItems: 'flex-end', gap: 6 },
  msgAvatar:       { width: 28, height: 28, borderRadius: '50%', background: '#a5b4fc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  bubble:          { maxWidth: '65%', padding: '8px 12px', borderRadius: 16, fontSize: 14, lineHeight: 1.5 },
  bubbleMine:      { background: '#4f46e5', color: '#fff', borderBottomRightRadius: 4 },
  bubbleOther:     { background: '#fff', color: '#111', borderBottomLeftRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  senderName:      { fontSize: 11, fontWeight: 700, color: '#4f46e5', marginBottom: 3 },
  msgTime:         { fontSize: 10, opacity: 0.6, textAlign: 'right', marginTop: 3 },
  msgImage:        { maxWidth: 200, borderRadius: 8, display: 'block' },
  fileLink:        { color: 'inherit', textDecoration: 'underline' },
  // Typing bubble
  typingRow:       { display: 'flex', alignItems: 'flex-end', gap: 6 },
  typingBubble:    { background: '#fff', borderRadius: 16, borderBottomLeftRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  dot1:            { ...dotBase, animationDelay: '0ms'   },
  dot2:            { ...dotBase, animationDelay: '160ms' },
  dot3:            { ...dotBase, animationDelay: '320ms' },
  // Input
  inputRow:        { padding: '12px 16px', background: '#fff', borderTop: '1px solid #e8e8e8', display: 'flex', gap: 8, alignItems: 'center' },
  attachBtn:       { width: 42, height: 42, borderRadius: '50%', border: '1px solid #e0e0e0', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', flexShrink: 0 },
  textInput:       { flex: 1, padding: '10px 14px', borderRadius: 24, border: '1px solid #e0e0e0', fontSize: 14, outline: 'none' },
  sendBtn:         { width: 42, height: 42, borderRadius: '50%', border: 'none', background: '#4f46e5', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
