import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Image, Linking, ActivityIndicator,
  ActionSheetIOS, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api, { BASE_URL } from '../api/client';
import { connectSocket } from '../socket';

export default function ChatScreen({ route, navigation }) {
  const { chat } = route.params;
  const [me, setMe]           = useState({});
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [uploading, setUploading] = useState(false);
  const socketRef  = useRef(null);
  const scrollRef  = useRef(null);
  const chatName = chat.is_group
    ? chat.name
    : (chat.partner_display_name || chat.partner_username);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({ title: chatName });
    AsyncStorage.getItem('mm_user').then(u => { if (u) setMe(JSON.parse(u)); });
    api.get(`/chats/${chat.id}/messages`).then(r => setMessages(r.data)).catch(console.error);

    connectSocket().then(s => {
      socketRef.current = s;
      s.emit('chat:join', chat.id);
      s.on('message:new', (msg) => {
        if (msg.chat_id === chat.id) {
          setMessages(prev => [...prev, msg]);
        }
      });
    });
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // ─── Отправка текста ─────────────────────────────────────────────────────
  const handleSend = () => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit('message:send', { chatId: chat.id, content: text.trim() });
    setText('');
  };

  // ─── Загрузка файла на сервер ────────────────────────────────────────────
  const uploadAndSend = async (uri, name, type) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, name, type });

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (socketRef.current) {
        socketRef.current.emit('message:send', {
          chatId:   chat.id,
          content:  null,
          fileUrl:  data.url,
          fileName: data.name,
          fileType: data.type,
        });
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось отправить файл. Попробуй ещё раз.');
      console.error('upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // ─── Выбор фото из галереи ───────────────────────────────────────────────
  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разреши доступ к галерее в настройках телефона.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,  // фото и видео
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name  = asset.fileName || `photo_${Date.now()}.jpg`;
      const type  = asset.mimeType || 'image/jpeg';
      uploadAndSend(asset.uri, name, type);
    }
  };

  // ─── Съёмка фото камерой ─────────────────────────────────────────────────
  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разреши доступ к камере в настройках телефона.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name  = `photo_${Date.now()}.jpg`;
      const type  = asset.mimeType || 'image/jpeg';
      uploadAndSend(asset.uri, name, type);
    }
  };

  // ─── Выбор документа ─────────────────────────────────────────────────────
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      uploadAndSend(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
    }
  };

  // ─── Action Sheet: выбор источника ───────────────────────────────────────
  const handleAttach = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Отмена', 'Галерея', 'Камера', 'Документ'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) pickFromGallery();
          if (idx === 2) pickFromCamera();
          if (idx === 3) pickDocument();
        }
      );
    } else {
      // Android — обычный Alert с кнопками
      Alert.alert('Прикрепить файл', '', [
        { text: 'Галерея',   onPress: pickFromGallery },
        { text: 'Камера',    onPress: pickFromCamera },
        { text: 'Документ',  onPress: pickDocument },
        { text: 'Отмена', style: 'cancel' },
      ]);
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
      >
        {messages.map(item => {
          const isMine  = item.sender_id === me.id;
          const isImage = item.file_type?.startsWith('image/');
          return (
            <View
              key={item.id}
              style={{ marginBottom: 6, flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start' }}
            >
              <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
                {!isMine && (
                  <Text style={s.senderName}>{item.sender_display_name}</Text>
                )}

                {/* Изображение */}
                {item.file_url && isImage && (
                  <Image
                    source={{ uri: `${BASE_URL}${item.file_url}` }}
                    style={s.msgImage}
                    resizeMode="cover"
                  />
                )}

                {/* Документ / файл */}
                {item.file_url && !isImage && (
                  <TouchableOpacity onPress={() => Linking.openURL(`${BASE_URL}${item.file_url}`)}>
                    <Text style={{ color: isMine ? '#c7d2fe' : '#4f46e5', textDecorationLine: 'underline' }}>
                      📎 {item.file_name}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Текст */}
                {item.content ? (
                  <Text style={{ color: isMine ? '#fff' : '#111', fontSize: 15 }}>
                    {item.content}
                  </Text>
                ) : null}

                <Text style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : '#aaa', textAlign: 'right', marginTop: 2 }}>
                  {new Date(item.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Строка ввода */}
      <View style={s.inputRow}>
        {/* Кнопка прикрепить */}
        <TouchableOpacity
          style={s.attachBtn}
          onPress={handleAttach}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color="#4f46e5" />
            : <Text style={{ fontSize: 22, color: '#4f46e5' }}>📎</Text>
          }
        </TouchableOpacity>

        <TextInput
          style={s.input}
          placeholder="Сообщение..."
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
        />

        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bubble:      { maxWidth: '75%', padding: 10, borderRadius: 16 },
  bubbleMine:  { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  senderName:  { fontSize: 11, fontWeight: '700', color: '#4f46e5', marginBottom: 3 },
  msgImage:    { width: 180, height: 180, borderRadius: 8, marginBottom: 4 },
  inputRow: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    gap: 8,
  },
  attachBtn: {
    width: 38, height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42,
    borderRadius: 21,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
