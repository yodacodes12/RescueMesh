/** Android runtime permissions needed for GPS and Nearby Connections, per OS version. */
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

const P = PermissionsAndroid.PERMISSIONS;

export function nearbyPermissions(): Permission[] {
  const api = Platform.OS === 'android' ? Number(Platform.Version) : 0;
  const list: Permission[] = [P.ACCESS_FINE_LOCATION];
  if (api >= 31) {
    list.push(P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT);
  }
  if (api >= 33) {
    list.push(P.NEARBY_WIFI_DEVICES);
  }
  return list;
}

export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unknown';

export interface PermissionSummary {
  location: PermissionState;
  bluetooth: PermissionState; // Bluetooth + Nearby Wi-Fi (Android 12+), else N/A -> granted
}

async function check(perms: Permission[]): Promise<PermissionState> {
  if (Platform.OS !== 'android') {
    return 'unknown';
  }
  for (const p of perms) {
    if (!(await PermissionsAndroid.check(p))) {
      return 'denied';
    }
  }
  return 'granted';
}

export async function getPermissionSummary(): Promise<PermissionSummary> {
  const all = nearbyPermissions();
  return {
    location: await check([P.ACCESS_FINE_LOCATION]),
    bluetooth: await check(all.filter(p => p !== P.ACCESS_FINE_LOCATION)),
  };
}

export async function requestLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const r = await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION, {
    title: 'Location for your SOS',
    message: 'RescueMesh attaches your GPS position to SOS alerts so rescuers can find you. GPS works without internet.',
    buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestNearby(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const res = await PermissionsAndroid.requestMultiple(nearbyPermissions());
  return Object.values(res).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
}
