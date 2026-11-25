/**
 * Photo picking for claim attachments, via expo-image-picker — loaded lazily.
 *
 * expo-image-picker is a native module. Expo Go (SDK 54) ships it, but preview
 * APKs built before it was added don't, and OTA updates can't add native code.
 * Importing it at the top of a file would crash those builds on launch, so we
 * only `require` it after confirming the native module exists. On builds
 * without it, `photoPickerAvailable()` is false and the UI explains that a
 * newer app build is needed to attach photos.
 */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { LocalFile } from '@/api/claims';

type ImagePickerModule = typeof import('expo-image-picker');

let cached: ImagePickerModule | null | undefined;
function picker(): ImagePickerModule | null {
  if (cached !== undefined) return cached;
  try {
    const hasNative = Platform.OS === 'web' || !!requireOptionalNativeModule('ExponentImagePicker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = hasNative ? (require('expo-image-picker') as ImagePickerModule) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function photoPickerAvailable() {
  return !!picker();
}

type Asset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  file?: Blob | null;
  type?: string | null;
};

function toLocalFile(a: Asset, i: number): LocalFile {
  const isVideo = a.type === 'video' || /^video\//.test(a.mimeType || '');
  const type = a.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const name = a.fileName || `claim-photo-${Date.now()}-${i + 1}.${ext}`;
  return { uri: a.uri, name, type, size: a.fileSize ?? undefined, file: a.file ?? undefined };
}

// quality 0.6 keeps typical phone photos well under the 4.4 MB upload cap.
const QUALITY = 0.6;

/** Choose one or more photos from the library. Returns [] if cancelled. */
export async function pickFromLibrary(): Promise<LocalFile[]> {
  const ip = picker();
  if (!ip) throw new Error('Photo picking needs a newer app build.');
  const res = await ip.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: QUALITY,
  });
  if (res.canceled) return [];
  return res.assets.map(toLocalFile);
}

/** Take a photo with the camera. Returns [] if cancelled or permission denied. */
export async function takePhoto(): Promise<LocalFile[]> {
  const ip = picker();
  if (!ip) throw new Error('Taking photos needs a newer app build.');
  const perm = await ip.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is off. Turn it on in Settings to take claim photos.');
  const res = await ip.launchCameraAsync({ mediaTypes: ['images'], quality: QUALITY });
  if (res.canceled) return [];
  return res.assets.map(toLocalFile);
}
