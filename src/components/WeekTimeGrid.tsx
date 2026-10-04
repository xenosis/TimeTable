import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TimetableItem } from '../db/timetableRepository';
import { resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { lightenColor, scheduleStatus } from '../utils/scheduleClock';
import { buildWeekGrid, cellRect, formatMinutes, rowHeights, rowOffsets, type GridDay } from '../utils/timetableGrid';
import { SCHOOL_WEEKDAYS } from '../utils/weekdays';

/**
 * 세로는 좁아서 제목 2줄이 들어가는 36dp가 최소 행 높이다(docs/timetable-grid-feasibility.md).
 * 가로는 칸이 넓어 한 줄로 읽히고 헤더·탭을 숨기므로 행을 더 촘촘하게(분당 0.8dp, 최소 28dp) 그려 세로 스크롤을 줄인다.
 */
/** 주간표에서 이동하는 방법을 알려주는 문구. 가로 화면은 헤더를 따로 고정하므로 화면에서 같은 문구를 쓴다. */
export const WEEK_HINT = '요일(월~금)을 누르면 그 요일 시간표를 볼 수 있어요';

const SIZES = {
  portrait: { timeWidth: 40, minRow: 32, maxRow: 52, dpPerMinute: 0.9, title: 11, time: 9, timeLabel: 10 },
  landscape: { timeWidth: 56, minRow: 28, maxRow: 48, dpPerMinute: 0.8, title: 13, time: 11, timeLabel: 10 },
} as const;

function useGridSize() {
  const { width, height } = useWindowDimensions();
  return width > height ? SIZES.landscape : SIZES.portrait;
}

/** 요일 헤더. 가로 주간 보기에서는 스크롤에 밀려 사라지지 않게 표 밖에 따로 고정해 둘 수 있다. */
export function WeekDayHeader({ theme, today, onSelectDay }: {
  readonly theme: ThemeDefinition;
  readonly today: number;
  readonly onSelectDay: (weekday: number) => void;
}) {
  const size = useGridSize();
  return <View style={styles.headerRow}>
    <View style={{ width: size.timeWidth, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.dayLabel, { color: theme.colors.textMuted }]}>시간</Text></View>
    {SCHOOL_WEEKDAYS.map(({ day, label }) => (
      <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${label}요일 시간표로 이동`} onPress={() => onSelectDay(day)} style={styles.dayHeader}>
        <Text style={[styles.dayLabel, { color: day === today ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
      </Pressable>
    ))}
  </View>;
}

export function WeekTimeGrid({ theme, days, today, onSelectDay, showHeader = true, nowMinutes }: {
  readonly theme: ThemeDefinition;
  readonly days: readonly GridDay<TimetableItem>[];
  readonly today: number;
  readonly onSelectDay: (weekday: number) => void;
  readonly showHeader?: boolean;
  /** 지금 시각(하루 중 분). 주어지면 오늘 요일의 진행 중 일정만 원래 색으로 강조하고 나머지는 연하게 보여준다 */
  readonly nowMinutes?: number;
}) {
  const size = useGridSize();
  const { rows, cells, unplaced } = buildWeekGrid(days);
  const heights = rowHeights(rows, size.dpPerMinute, size.minRow, size.maxRow);
  const { tops, total } = rowOffsets(heights);
  const lineColor = theme.decorations.cardBorder;
  const dayLabel = (day: number) => SCHOOL_WEEKDAYS.find((weekday) => weekday.day === day)?.label ?? '';

  return <View style={styles.wrap}>
    {showHeader && <WeekDayHeader theme={theme} today={today} onSelectDay={onSelectDay} />}
    {showHeader && <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{WEEK_HINT}</Text>}
    {rows.length > 0 && <View style={[styles.body, { height: total }]}>
      {tops.map((top, index) => <View key={`line-${index}`} pointerEvents="none" style={[styles.line, { top, borderTopColor: lineColor }]} />)}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size.timeWidth, height: total }}>
        {rows.map((row, index) => {
          const next = rows[index + 1];
          const showEnd = !next || next.startMin !== row.endMin;
          return <View key={`time-${index}`} style={{ position: 'absolute', top: tops[index], height: heights[index], width: size.timeWidth, justifyContent: 'space-between' }}>
            <Text style={[styles.timeLabel, { fontSize: size.timeLabel, color: theme.colors.textMuted }]}>{formatMinutes(row.startMin)}</Text>
            {showEnd && <Text style={[styles.timeLabel, { fontSize: size.timeLabel, color: theme.colors.textMuted }]}>{formatMinutes(row.endMin)}</Text>}
          </View>;
        })}
      </View>
      {SCHOOL_WEEKDAYS.map(({ day }) => (
        <View key={day} style={[styles.dayColumn, { height: total, borderLeftColor: lineColor }]}>
          {cells.filter((cell) => cell.day === day).map((cell) => {
            const rect = cellRect(cell, heights);
            const category = resolveThemeColor(theme, cell.item.colorKey);
            const icon = resolveThemeIcon(theme, cell.item.iconKey);
            // 시작·종료 시각은 왼쪽 시간 칼럼에서만 읽는다(일정 칸에는 시간 문자열을 남기지 않는다). range는 화면 읽기용 라벨에만 쓴다
            const current = nowMinutes != null && day === today && scheduleStatus(cell.item.startTime, cell.item.endTime, nowMinutes) === 'current';
            const highlighted = current || nowMinutes == null; // 현재 시각 정보가 없으면 예전처럼 모두 원래 색
            const range = `${cell.item.startTime}~${cell.item.endTime}`;
            // 칸은 누르는 곳이 아니라 보는 곳이다: 스크롤하다 실수로 화면이 바뀌지 않게 이동은 요일 글자에서만 한다
            return <View
              key={cell.item.id}
              accessible
              accessibilityLabel={`${dayLabel(day)}요일 ${range} ${cell.item.title}${cell.item.memo ? `, 메모: ${cell.item.memo}` : ''}${current ? ', 지금 진행 중' : ''}`}
              style={[styles.cell, {
                top: rect.top, height: rect.height, left: `${rect.leftRatio * 100}%`, width: `${rect.widthRatio * 100}%`,
                backgroundColor: highlighted ? category.backgroundColor : lightenColor(category.backgroundColor, 0.78),
              }, current && { borderColor: theme.colors.text, borderWidth: 2 }]}
            >
              <Text style={[styles.cellTitle, { fontSize: size.title, color: highlighted ? category.textColor : theme.colors.text }]} numberOfLines={3}>{cell.item.memo ? '📝' : ''}{icon.glyph} {cell.item.title}</Text>
            </View>;
          })}
        </View>
      ))}
    </View>}
    {unplaced.length > 0 && <View style={styles.unplaced}>
      <Text style={[styles.unplacedTitle, { color: theme.colors.text }]}>시간을 알 수 없는 일정</Text>
      {unplaced.map(({ day, item }) => (
        <Text key={item.id} style={{ color: theme.colors.textMuted }}>{dayLabel(day)} · {item.title}</Text>
      ))}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  hint: { fontSize: 12, marginBottom: spacing.xs, textAlign: 'center' },
  headerRow: { flexDirection: 'row', paddingBottom: spacing.xs },
  dayHeader: { alignItems: 'center', flex: 1, paddingVertical: spacing.xs },
  dayLabel: { fontSize: 14, fontWeight: '700' },
  body: { flexDirection: 'row', position: 'relative', width: '100%' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  timeLabel: { fontWeight: '700', textAlign: 'center' },
  dayColumn: { borderLeftWidth: StyleSheet.hairlineWidth, flex: 1, position: 'relative' },
  cell: { alignItems: 'center', borderRadius: 4, justifyContent: 'center', overflow: 'hidden', padding: 2, position: 'absolute' },
  cellTitle: { fontWeight: '700', textAlign: 'center' },
  cellTime: { fontWeight: '600', textAlign: 'center' },
  unplaced: { gap: spacing.xs, marginTop: spacing.md },
  unplacedTitle: { fontWeight: '700' },
});
