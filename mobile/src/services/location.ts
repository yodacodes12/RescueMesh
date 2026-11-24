/** One-shot GPS fix. GPS satellites work with no mobile network or internet. */
import Geolocation from '@react-native-community/geolocation';
import { requestLocation } from './permissions';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  at: string;
}

export async function captureLocation(timeoutMs = 20000): Promise<Fix> {
  const ok = await requestLocation();
  if (!ok) {
    throw new Error('Location permission denied');
  }
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          at: new Date(pos.timestamp).toISOString(),
        }),
      err => reject(new Error(err.message || 'Could not get GPS fix')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}
