/**
 * Base64 編解碼工具
 *
 * 為什麼不用 Buffer？
 *   Cloudflare Worker 執行環境沒有 Node.js 的 Buffer 物件。
 *   btoa / atob 在 Worker 與 Node 16+ 皆為全域函式，可直接使用。
 */

/** ArrayBuffer → base64 字串 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // 一次處理較大區塊，避免逐位元組呼叫造成效能問題
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    );
  }
  return btoa(binary);
}

/** base64 字串 → ArrayBuffer */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
