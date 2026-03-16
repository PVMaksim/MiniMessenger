import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!username || !password) return setError('Заполните все поля');
    setLoading(true);
    try {
      const url = mode === 'login' ? '/auth/login' : '/auth/register';
      const { data } = await api.post(url, { username, password, display_name: displayName });
      await AsyncStorage.setItem('mm_token', data.token);
      await AsyncStorage.setItem('mm_user', JSON.stringify(data.user));
      navigation.replace('Chats');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.logo}>💬</Text>
        <Text style={s.title}>MiniMessenger</Text>
        <Text style={s.subtitle}>Мессенджер для своих</Text>

        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, mode === 'login' && s.tabActive]} onPress={() => { setMode('login'); setError(''); }}>
            <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>Войти</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, mode === 'register' && s.tabActive]} onPress={() => { setMode('register'); setError(''); }}>
            <Text style={[s.tabText, mode === 'register' && s.tabTextActive]}>Регистрация</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={s.input} placeholder="Логин" value={username} onChangeText={setUsername} autoCapitalize="none" />
        {mode === 'register' && (
          <TextInput style={s.input} placeholder="Отображаемое имя" value={displayName} onChangeText={setDisplayName} />
        )}
        <TextInput style={s.input} placeholder="Пароль" value={password} onChangeText={setPassword} secureTextEntry />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page:         { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', padding: 24 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  logo:         { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title:        { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle:     { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  tabs:         { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', marginBottom: 16 },
  tab:          { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  tabActive:    { backgroundColor: '#4f46e5' },
  tabText:      { fontSize: 14, color: '#555' },
  tabTextActive:{ color: '#fff', fontWeight: '600' },
  input:        { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 10 },
  error:        { backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 10 },
  btn:          { backgroundColor: '#4f46e5', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
});
