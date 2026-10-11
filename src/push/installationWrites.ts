let pending: Promise<unknown> = Promise.resolve();

/** 계정이 바뀌어도 같은 설치본의 이전 요청이 최신 등록 뒤에 확정되지 않게 한다. */
export function withInstallationWrite<T>(write: () => Promise<T>): Promise<T> {
  const result = pending.then(write);
  pending = result.catch(() => undefined);
  return result;
}
