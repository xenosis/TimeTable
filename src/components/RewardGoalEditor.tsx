import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addRewardGoal, getStickerSummary, markRewardAchieved, type RewardGoal } from '../db/stickerRepository';
import { getDatabase } from '../db/database';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';

export function RewardGoalEditor({ theme, onChanged }: { readonly theme: ThemeDefinition; readonly onChanged: () => void }) {
  const [goal, setGoal] = useState<RewardGoal | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('');
  const [message, setMessage] = useState('');
  const load = () => { void getDatabase().then(getStickerSummary).then((summary) => setGoal(summary.goal)).catch(() => setMessage('보상 목표를 불러오지 못했어요.')); };
  useEffect(load, []);
  const add = async () => { try { await addRewardGoal(await getDatabase(), title, Number(count)); setTitle(''); setCount(''); setMessage('새 보상 목표를 정했어요.'); load(); onChanged(); } catch (error) { setMessage(error instanceof Error ? error.message : '보상 목표를 저장하지 못했어요.'); } };
  const achieve = async () => { if (!goal) return; try { await markRewardAchieved(await getDatabase(), goal.id); setMessage('보상을 받았어요! 다음 목표도 정할 수 있어요.'); load(); onChanged(); } catch { setMessage('보상 상태를 바꾸지 못했어요.'); } };
  return <View style={[styles.card, { borderColor: theme.colors.border }]}><Text style={[styles.title, { color: theme.colors.text }]}>보상 목표</Text>{goal ? <><Text style={{ color: theme.colors.text }}>{goal.title} · 보석 {goal.stickerGoal}개</Text><Pressable accessibilityRole="button" accessibilityLabel="보상 받았어요" onPress={() => void achieve()} style={[styles.button, { backgroundColor: theme.colors.secondary }]}><Text style={{ color: theme.colors.onPrimary }}>보상 받았어요</Text></Pressable></> : <><TextInput value={title} onChangeText={setTitle} placeholder="예: 주말 영화" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} /><TextInput value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="필요한 보석 수" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]} /><Pressable accessibilityRole="button" accessibilityLabel="보상 목표 저장" onPress={() => void add()} style={[styles.button, { backgroundColor: theme.colors.primary }]}><Text style={{ color: theme.colors.onPrimary }}>보상 목표 저장</Text></Pressable></>}{!!message && <Text style={{ color: theme.colors.textMuted }}>{message}</Text>}</View>;
}
const styles = StyleSheet.create({ card: { borderRadius: borderRadius.lg, borderWidth: 1, gap: adminSpacing.xs, padding: adminSpacing.sm, width: '100%' }, title: { fontSize: adminFontSize.body, fontWeight: '700' }, input: { borderRadius: borderRadius.md, borderWidth: 1, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.xs }, button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget } });
