const NOTICE_KEY = 'integriti_login_notice_seen';

export function clearLoginNoticeFlag() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(NOTICE_KEY);
}

export function markLoginNoticeSeen() {
  if (typeof window !== 'undefined') sessionStorage.setItem(NOTICE_KEY, '1');
}

export function wasLoginNoticeSeen() {
  if (typeof window === 'undefined') return true;
  return sessionStorage.getItem(NOTICE_KEY) === '1';
}
