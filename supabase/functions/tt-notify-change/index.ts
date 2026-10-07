import { changePushHandler } from './handler.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_ANON_KEY');
if (!url || !key) throw new Error('Supabase 함수 환경 설정이 없습니다.');
Deno.serve(changePushHandler({ url, key, expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') }));
