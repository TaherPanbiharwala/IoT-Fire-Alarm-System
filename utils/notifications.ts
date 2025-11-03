import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } else {
    alert('Must use physical device for Push Notifications');
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
} 

export async function notifyDanger(title: string, body: string) {
  try {
    // Web doesn't support Expo push/local notifications — bail early
    if (Platform.OS === 'web') {
      console.warn('[notifyDanger]', title, body);
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('Failed to schedule notification:', e);
  }
}