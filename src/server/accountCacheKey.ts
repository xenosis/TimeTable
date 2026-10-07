/**
 * 이 기기에서 마지막으로 서버와 확인한 계정·역할을 저장하는 키(expo-sqlite localStorage = kv-store).
 * 서버 모듈을 불러오지 않는 곳(알람 예약 등)에서도 읽을 수 있게 따로 둔다.
 */
export const ACCOUNT_CACHE_KEY = 'tt.account.membership';
/** 로그아웃해도 유지하는 기기 용도. 딸 계정으로 로그인했을 때만 딸 알림을 다시 허용한다. */
export const DEVICE_ROLE_KEY = 'tt.device.role';
