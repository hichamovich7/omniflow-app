export function getPinImageStoragePath(
  userId: string,
  pinId: string,
  version: number
): string {
  return `${userId}/${pinId}/${version}.png`;
}

export function getPinSourceStoragePath(storagePath: string): string {
  const extensionIndex = storagePath.lastIndexOf('.');
  if (extensionIndex === -1) return `${storagePath}.source`;
  return `${storagePath.slice(0, extensionIndex)}.source${storagePath.slice(extensionIndex)}`;
}
