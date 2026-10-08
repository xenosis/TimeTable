import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TimetableItem } from '../db/timetableRepository';
import { resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { buildCellLines, categoryText } from '../utils/cellText';
import { DIMMED_BACKGROUND_LIGHTEN, DIMMED_TEXT_LIGHTEN, lightenColor, scheduleStatus } from '../utils/scheduleClock';
import { buildWeekGrid, cellRect, fitRowHeights, formatMinutes, rowHeights, rowOffsets, type GridDay } from '../utils/timetableGrid';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
/** 요일 헤더 한 줄이 차지하는 높이(dp)와, 한 화면에 맞출 때 허용하는 가장 낮은 행 높이(dp) */
const HEADER_HEIGHT = 44;
const FIT_MIN_ROW = 28;

/**
 * 세로는 좁아서 제목 2줄이 들어가는 36dp가 최소 행 높이다(docs/timetable-grid-feasibility.md).
 * 가로는 칸이 넓어 한 줄로 읽히고 헤더·탭을 숨기므로 행을 더 촘촘하게(분당 0.8dp, 최소 28dp) 그려 세로 스크롤을 줄인다.
 * focus는 한 요일만 크게 보는 모드다: 칼럼이 하나라 넓으므로 글자를 키우고 행을 높인다.
 */
const SIZES = {
  portrait: { timeWidth: 40, minRow: 32, maxRow: 52, dpPerMinute: 0.9, title: 11, time: 9, timeLabel: 10, header: 14 },
  landscape: { timeWidth: 56, minRow: 28, maxRow: 48, dpPerMinute: 0.8, title: 13, time: 11, timeLabel: 10, header: 14 },
  focus: { timeWidth: 52, minRow: 64, maxRow: 140, dpPerMinute: 1.8, title: 18, time: 13, timeLabel: 13, header: 18 },
} as const;

function useGridSize(focus = false) {
  const { width, height } = useWindowDimensions();
  if (focus) return SIZES.focus;
  return width > height ? SIZES.landscape : SIZES.portrait;
}

/** 요일 헤더. 가로 주간 보기에서는 스크롤에 밀려 사라지지 않게 표 밖에 따로 고정해 둘 수 있다. days를 주면 그 요일들만 그린다(기본 월~금). */
export function WeekDayHeader({ theme, today, onSelectDay, days = [1, 2, 3, 4, 5], focus = false }: {
  readonly theme: ThemeDefinition;
  readonly today: number;
  readonly onSelectDay: (weekday: number) => void;
  readonly days?: readonly number[];
  readonly focus?: boolean;
}) {
  const size = useGridSize(focus);
  return <View style={styles.headerRow}>
    <View style={{ width: size.timeWidth, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.dayLabel, { fontSize: size.header, color: theme.colors.textMuted }]}>시간</Text></View>
    {days.map((day) => (
      <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${WEEKDAY_LABELS[day]}요일 시간표로 이동`} onPress={() => onSelectDay(day)} style={styles.dayHeader}>
        {/* 테두리 있는 버튼 모양이라 안내 문구 없이도 누를 수 있는 곳으로 보인다 */}
        <View style={[styles.dayChip, { borderColor: theme.colors.primary, backgroundColor: day === today ? theme.colors.primary : theme.colors.surface }]}>
          <Text style={[styles.dayLabel, { fontSize: size.header, color: day === today ? theme.colors.onPrimary : theme.colors.primary }]}>{focus ? `${WEEKDAY_LABELS[day]}요일` : WEEKDAY_LABELS[day]}</Text>
        </View>
      </Pressable>
    ))}
  </View>;
}

export function WeekTimeGrid({ theme, days, today, onSelectDay, showHeader = true, nowMinutes, focus = false, fitHeight, preview = false }: {
  readonly theme: ThemeDefinition;
  readonly days: readonly GridDay<TimetableItem>[];
  readonly today: number;
  readonly onSelectDay: (weekday: number) => void;
  readonly showHeader?: boolean;
  /** 지금 시각(하루 중 분). 주어지면 today 요일의 진행 중 일정만 원래 색으로 강조하고 나머지는 연하게 보여준다 */
  readonly nowMinutes?: number;
  /** 한 요일만 크게 보기. days에는 그 요일 하나만 넣는다 */
  readonly focus?: boolean;
  /** 표(헤더 포함)가 쓸 수 있는 세로 높이(dp). 주어지면 행 높이를 비율대로 맞춰 스크롤 없이 한 화면에 담는다(행이 너무 낮아지면 맞추지 않는다) */
  readonly fitHeight?: number;
  /** 실제 오늘이 아닌 요일을 같은 시각대로 미리 보여주는 중이면 true(화면 읽기 라벨만 달라진다) */
  readonly preview?: boolean;
}) {
  const size = useGridSize(focus);
  const { rows, cells, unplaced } = buildWeekGrid(days);
  const baseHeights = rowHeights(rows, size.dpPerMinute, size.minRow, size.maxRow);
  const bodyFit = fitHeight != null ? fitHeight - (showHeader ? HEADER_HEIGHT : 0) : undefined;
  const heights = bodyFit != null ? fitRowHeights(baseHeights, bodyFit, FIT_MIN_ROW) : baseHeights;
  const { tops, total } = rowOffsets(heights);
  const lineColor = theme.decorations.cardBorder;
  const dayLabel = (day: number) => WEEKDAY_LABELS[day] ?? '';
  const dayNumbers = days.map(({ day }) => day);

  return <View style={styles.wrap}>
    {showHeader && <WeekDayHeader theme={theme} today={today} onSelectDay={onSelectDay} days={dayNumbers} focus={focus} />}
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
      {dayNumbers.map((day) => (
        <View key={day} style={[styles.dayColumn, { height: total, borderLeftColor: lineColor }]}>
          {cells.filter((cell) => cell.day === day).map((cell) => {
            const rect = cellRect(cell, heights);
            const category = resolveThemeColor(theme, cell.item.colorKey);
            const icon = resolveThemeIcon(theme, cell.item.iconKey);
            // 시작·종료 시각은 왼쪽 시간 칼럼에서만 읽는다(일정 칸에는 시간 문자열을 남기지 않는다). range는 화면 읽기용 라벨에만 쓴다
            const current = nowMinutes != null && day === today && scheduleStatus(cell.item.startTime, cell.item.endTime, nowMinutes) === 'current';
            const highlighted = current || nowMinutes == null; // 현재 시각 정보가 없으면 예전처럼 모두 원래 색
            const range = `${cell.item.startTime}~${cell.item.endTime}`;
            // 진행 중이 아닌 칸은 배경과 글자를 모두 연하게 한다(글자는 읽을 수 있는 대비를 유지)
            const textColor = highlighted ? category.textColor : lightenColor(theme.colors.text, DIMMED_TEXT_LIGHTEN);
            // 칸 높이에 맞춰 구분 / 이름 / 기타 순서로 줄을 나눈다. 이름은 항상 한 줄이라 길면 글자를 줄여 맞춘다
            const lines = buildCellLines({ category: cell.item.category, title: cell.item.title, glyph: icon.glyph, hasMemo: !!cell.item.memo, hasAlert: (cell.item as { alertMode?: string }).alertMode != null && (cell.item as { alertMode?: string }).alertMode !== 'none', heightDp: rect.height, fontSize: size.title });
            // 칸은 누르는 곳이 아니라 보는 곳이다: 스크롤하다 실수로 화면이 바뀌지 않게 이동은 요일 글자에서만 한다
            return <View
              key={cell.item.id}
              accessible
              accessibilityLabel={`${dayLabel(day)}요일 ${range} ${categoryText[cell.item.category]} ${cell.item.title}${cell.item.memo ? `, 메모: ${cell.item.memo}` : ''}${current ? (preview ? ', 지금 시각과 같은 시간대' : ', 지금 진행 중') : ''}`.replace(/\s+/g, ' ')}
              style={[styles.cell, {
                top: rect.top, height: rect.height, left: `${rect.leftRatio * 100}%`, width: `${rect.widthRatio * 100}%`,
                backgroundColor: highlighted ? category.backgroundColor : lightenColor(category.backgroundColor, DIMMED_BACKGROUND_LIGHTEN),
              }, current && { borderColor: theme.colors.text, borderWidth: 2 }]}
            >
              {lines.first !== '' && <Text style={[styles.cellKind, { fontSize: size.title - 1, color: textColor }]} numberOfLines={1}>{lines.first}</Text>}
              <Text style={[styles.cellTitle, { fontSize: size.title, color: textColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{lines.title}</Text>
              {lines.extras !== '' && <Text style={[styles.cellExtras, { fontSize: size.title - 1, color: textColor }]} numberOfLines={1}>{lines.extras}</Text>}
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
  headerRow: { flexDirection: 'row', height: HEADER_HEIGHT, paddingBottom: spacing.xs },
  dayHeader: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 2 },
  dayChip: { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, justifyContent: 'center', minHeight: 34, minWidth: 34, paddingHorizontal: 8, width: '100%' },
  dayLabel: { fontWeight: '700' },
  body: { flexDirection: 'row', position: 'relative', width: '100%' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  timeLabel: { fontWeight: '700', textAlign: 'center' },
  dayColumn: { borderLeftWidth: StyleSheet.hairlineWidth, flex: 1, position: 'relative' },
  cell: { alignItems: 'center', borderRadius: 4, justifyContent: 'center', overflow: 'hidden', padding: 2, position: 'absolute' },
  // 흐리게(투명도) 그리면 과목 색 위 글자 대비가 4.5:1 아래로 떨어져 불투명하게 둔다(P7.5 리뷰)
  cellKind: { fontWeight: '600', textAlign: 'center' },
  cellTitle: { fontWeight: '700', textAlign: 'center' },
  cellExtras: { textAlign: 'center' },
  unplaced: { gap: spacing.xs, marginTop: spacing.md },
  unplacedTitle: { fontWeight: '700' },
});
