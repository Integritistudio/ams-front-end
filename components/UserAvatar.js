'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3303';

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('helpdesk_token');
}

export function avatarSrc(url) {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export function isProtectedUploadUrl(url) {
  if (!url) return false;
  return String(url).includes('/api/uploads/') && String(url).includes('/download');
}

/** Fetch an encrypted attachment/avatar with JWT and return a blob: URL. */
export async function fetchProtectedImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (!isProtectedUploadUrl(url)) return avatarSrc(url);

  const path = url.startsWith('http') ? new URL(url).pathname : url;
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Could not load image');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

/**
 * Circular avatar + optional name.
 * Loads `/api/uploads/.../download` URLs with auth (same as attachments).
 */
export default function UserAvatar({
  name,
  src,
  size = 'sm',
  showName = true,
  sub,
  className = '',
}) {
  const dim = { xs: 32, sm: 40, md: 44, lg: 110, table: 44 }[size] || 40;
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!src) return null;
    if (src.startsWith('data:') || src.startsWith('blob:') || !isProtectedUploadUrl(src)) {
      return avatarSrc(src);
    }
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    if (!src) {
      setDisplaySrc(null);
      return undefined;
    }

    if (src.startsWith('data:') || src.startsWith('blob:') || !isProtectedUploadUrl(src)) {
      setDisplaySrc(avatarSrc(src));
      return undefined;
    }

    setDisplaySrc(null);
    fetchProtectedImageUrl(src)
      .then((url) => {
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setDisplaySrc(url);
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const hasImg = Boolean(displaySrc);

  return (
    <span className={`user-avatar-inline ${className}`.trim()} title={name || ''}>
      {hasImg ? (
        <img
          className="user-avatar-img"
          src={displaySrc}
          alt={name || 'User'}
          width={dim}
          height={dim}
          style={{ width: dim, height: dim }}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = DEFAULT_AVATAR;
          }}
        />
      ) : (
        <span
          className="user-avatar-fallback"
          style={{ width: dim, height: dim, fontSize: Math.max(10, dim * 0.36) }}
        >
          {initialsFromName(name)}
        </span>
      )}
      {showName ? (
        <span className="user-avatar-meta">
          <span className="user-avatar-name">{name || '—'}</span>
          {sub ? <span className="user-avatar-sub">{sub}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Resize image File to a smaller JPEG File for upload to attachments storage. */
export function fileToAvatarUploadFile(file, { maxSize = 512, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file (JPG, PNG, WebP, GIF, or AVIF).'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image must be under 8 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not process image.'));
              return;
            }
            const out = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
            resolve(out);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Local preview helper (data URL). Prefer fileToAvatarUploadFile + uploadsApi for persistence. */
export function fileToAvatarDataUrl(file, { maxSize = 320, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    fileToAvatarUploadFile(file, { maxSize, quality })
      .then((f) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read processed image.'));
        reader.readAsDataURL(f);
      })
      .catch(reject);
  });
}
