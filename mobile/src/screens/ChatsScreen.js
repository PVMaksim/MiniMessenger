import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { connectSocket, disconnectSocket } from '../socket';

export default function ChatsScreen({ navigation }) {
  const [me, setMe] = useState({});
  const [chats, setChats] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [partnerInput, setPartnerInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('mm_user').then(u => { if (u) setMe(JSON.parse(u)); });
    api.get('/chats').then(r => setChats(r.data)).catch(console.error);

    let socket;
    connectSocket().then(s => {
      socket = s;
      s.on('user:online',  ({ userId }) => setOnlineUsers(prev => new Set([...prev, userId])));
      s.on('user:offline', ({ userId }) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(userId); return n; }));
      s.on('message:new',  (msg) => setChats(prev => prev.map(c =>
        c.id === msg.chat_id ? { ...c, last_message: msg.content || '📎 Файл', last_message_at: msg.created_at } : c
      )));
    });

    return () => {
      // сокет не закрываем — он используется в ChatScreen
    };
  }, []);

  const handleNewChat = async () => {
    setModalError('');
    setLoading(true);
    try {
      const { data } = await api.post('/chats', { partner_username: partnerInput.trim() });
      if (!data.already_exists) setChats(prev => [data, ...prev]);
      setShowModal(false);
      setPartnerInput('');
      navigation.navigate('Chat', { chat: data });
    } catch (err) {
      setModalError(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['mm_token', 'mm_user']);
    disconnectSocket();
    navigation.replace('Login');
  };

  const chatName = (chat) => chat.is_group ? chat.name : (chat.partner_display_name || chat.partner_username);

  const renderChat = ({ item }) => (
    <TouchableOpacity style={s.chatItem} onPress={() => navigation.navigate('Chat', { chat: item })}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{chatName(item)?.[0]?.toUpperCase() || '?'}</Text>
        {onlineUsers.has(item.partner_id) && <View style={s.onlineDot} />}
      </View>
      <View style={s.chatInfo}>
        <Text style={s.chatName}>{chatName(item)}</Text>
        <Text style={s.lastMsg} numberOfLines={1}>{item.last_message || 'Нет сообщений'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.headerName}>{me.display_name || me.username}</Text>
          <Text style={s.headerTag}>@{me.username}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowModal(true)}>
            <Text style={{ fontSize: 20 }}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={logout}>
            <Text style={{ fontSize: 20 }}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={renderChat}
        ListEmptyComponent={<Text style={s.empty}>Нет чатов. Нажми ✏️ чтобы начать</Text>}
      />

      <Modal visible={showModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Новый чат</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Логин собеседника"
              value={partnerInput}
              onChangeText={setPartnerInput}
              autoCapitalize="none"
              autoFocus
            />
            {modalError ? <Text style={s.modalError}>{modalError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => { setShowModal(false); setModalError(''); }}>
                <Text style={{ color: '#555' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnOk} onPress={handleNewChat} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Открыть</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page:           { flex: 1, backgroundColor: '#f0f2f5' },
  header:         { backgroundColor: '#fff', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerName:     { fontWeight: '700', fontSize: 16 },
  headerTag:      { color: '#aaa', fontSize: 12 },
  iconBtn:        { padding: 6 },
  chatItem:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 12 },
  avatar:         { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4f46e5', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  avatarText:     { color: '#fff', fontWeight: '700', fontSize: 18 },
  onlineDot:      { position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  chatInfo:       { flex: 1 },
  chatName:       { fontWeight: '600', fontSize: 15 },
  lastMsg:        { color: '#aaa', fontSize: 13, marginTop: 2 },
  empty:          { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 15 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle:     { fontWeight: '700', fontSize: 17, marginBottom: 14 },
  modalInput:     { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 12, fontSize: 15 },
  modalError:     { color: '#dc2626', fontSize: 13, marginTop: 6 },
  modalBtnCancel: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  modalBtnOk:     { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#4f46e5', alignItems: 'center' },
});
