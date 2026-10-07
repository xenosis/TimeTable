import { pushWorkerHandler } from '../tt-notify-change/worker.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const workerSecret = Deno.env.get('TT_PUSH_WORKER_SECRET');
if (!url || !serviceKey || !workerSecret) throw new Error('서버 푸시 작업자 환경 설정이 없습니다.');
Deno.serve(pushWorkerHandler({ url, serviceKey, workerSecret, expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') }));
