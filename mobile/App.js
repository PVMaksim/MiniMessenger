import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatScreen from './src/screens/ChatScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#4f46e5' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="Login"  component={LoginScreen}  options={{ headerShown: false }} />
        <Stack.Screen name="Chats"  component={ChatsScreen}  options={{ title: '💬 MiniMessenger' }} />
        <Stack.Screen name="Chat"   component={ChatScreen}   options={{ title: 'Чат' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
