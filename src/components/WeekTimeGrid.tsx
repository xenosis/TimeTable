import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TimetableItem } from '../db/timetableRepository';
import { spacing, type ThemeDefinition } from '../theme';
import { isMoveTitle, readableScheduleText, resolveScheduleColor, scheduleStripeColor } from '../theme/scheduleColors';
import { useTimetableView } from '../store/timetableView';
import { SchoolScheduleSummary } from './SchoolScheduleSummary';
import { categoryText } from '../utils/cellText';
import { cellTitleFontSize, fitScheduleRows, gridItemTitle, MOVE_TITLE_SHRINK } from '../utils/scheduleGridLayout';
import { schoolGridDays } from '../utils/schoolGridDays';
import { lightenColor, scheduleStatus } from '../utils/scheduleClock';
import { buildWeekGrid, cellRect, formatMinutes, rowOffsets, timeAxisConnector, timeAxisLabels, type GridDay } from '../utils/timetableGrid';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
/** 요일 헤더 한 줄 높이(dp). 실제 상단 전체 높이는 onLayout으로 잰다. */
const HEADER_HEIGHT = 44;

/**
 * 남은 높이에서 시간에 비례해 배분하고 실제 일정은 두 줄 제목 높이를 확보한다.
 * 모든 요일이 같은 시간축을 쓰며 오전·점심 접기 뒤 5교시부터 남긴다.
 */
const SIZES = {
  portrait: { timeWidth: 48, minRow: 14, dpPerMinute: 0.8, title: 12, timeLabel: 10, header: 14 },
  landscape: { timeWidth: 56, minRow: 14, dpPerMinute: 0.8, title: 13, timeLabel: 10, header: 14 },
  focus: { timeWidth: 56, minRow: 18, dpPerMinute: 1, title: 16, timeLabel: 13, header: 18 },
} as const;

function useGridSize(focus = false) {
  const { width, height, fontScale } = useWindowDimensions();
  const size = focus ? SIZES.focus : width > height ? SIZES.landscape : SIZES.portrait;
  return { ...size, timeWidth: Math.ceil(size.timeWidth * Math.max(1, fontScale)) };
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
  /** 표가 쓸 수 있는 실제 남은 높이. 마지막 일정까지 이 영역을 활용한다. */
  readonly fitHeight?: number;
  /** 실제 오늘이 아닌 요일을 같은 시각대로 미리 보여주는 중이면 true(화면 읽기 라벨만 달라진다) */
  readonly preview?: boolean;
}) {
  const size = useGridSize(focus);
  const { fontScale } = useWindowDimensions();
  const labelHeight = Math.ceil(size.minRow * fontScale);
  const schoolExpanded = useTimetableView((state) => state.schoolExpanded);
  const [controlsHeight, setControlsHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [bodyWidth, setBodyWidth] = useState(0);
  const toggleSchool = useTimetableView((state) => state.toggleSchool);
  const visibleDays = schoolGridDays(days, schoolExpanded);
  const hasSchool = days.some(({ items }) => items.some((item) => item.category === 'school'));
  const { rows, cells, unplaced } = buildWeekGrid(visibleDays);
  const bodyFit = fitHeight != null ? fitHeight - controlsHeight - labelHeight - (unplaced.length ? footerHeight : 0) : undefined;
  const titleLineHeight = Math.ceil(size.title * 1.2);
  // 이동 일정은 글자가 작고, 요일별 보기에서는 한 줄이라 칸 최소 높이도 낮춘다
  const moveLineHeight = Math.ceil((size.title - MOVE_TITLE_SHRINK) * 1.2);
  const heights = fitScheduleRows(rows, cells, bodyFit, {
    minCellHeight: (cell) => isMoveTitle(cell.item.title)
      ? moveLineHeight * Math.max(1, fontScale) * (focus ? 1 : 2) + 8
      : titleLineHeight * Math.max(1, fontScale) * 2 + 8,
    labelHeight, dpPerMinute: size.dpPerMinute * Math.max(1, fontScale),
  });
  const { tops, total } = rowOffsets(heights);
  const axis = timeAxisLabels(rows, heights, labelHeight);
  const lineColor = theme.decorations.cardBorder;
  const dayLabel = (day: number) => WEEKDAY_LABELS[day] ?? '';
  const dayNumbers = days.map(({ day }) => day);

  return <View style={styles.wrap}>
    <View testID="schedule-controls" onLayout={(event) => setControlsHeight(event.nativeEvent.layout.height)}>
      <SchoolScheduleSummary days={days} expanded={schoolExpanded} onToggle={toggleSchool} theme={theme} />
      <View style={styles.legend}>{(['school', 'after_school', 'academy'] as const).map((kind) => <Text key={kind} style={[styles.legendText, { color: resolveScheduleColor(kind, 'other').textColor, backgroundColor: resolveScheduleColor(kind, 'other').backgroundColor }]}>{categoryText[kind]}</Text>)}</View>
      {showHeader && <WeekDayHeader theme={theme} today={today} onSelectDay={onSelectDay} days={dayNumbers} focus={focus} />}
    </View>
    {!schoolExpanded && hasSchool && cells.length === 0 && unplaced.length === 0 && <Text style={{ color: theme.colors.textMuted }}>정규수업 뒤에 등록된 일정이 없어요.</Text>}
    {rows.length > 0 && <View onLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)} style={[styles.body, { height: total + labelHeight }]}>
      {tops.map((top, index) => <View key={`line-${index}`} pointerEvents="none" style={[styles.line, { top, borderTopColor: lineColor }]} />)}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size.timeWidth, height: total }}>
        {axis.map(({ minutes, anchor, top }) => {
          const connector = timeAxisConnector(top, anchor, labelHeight, size.timeWidth - 12, size.timeWidth - 2);
          return <View key={minutes}>
            <Text style={[styles.timeLabel, { position: 'absolute', top, width: size.timeWidth - 16, fontSize: size.timeLabel, lineHeight: size.minRow, color: theme.colors.textMuted }]}>{formatMinutes(minutes)}</Text>
            <View style={{ position: 'absolute', left: size.timeWidth - 2, top: anchor, width: 2, borderTopWidth: 1, borderColor: theme.colors.textMuted }} />
            {top !== anchor && <View style={{ position: 'absolute', left: connector.left, top: connector.top, width: connector.width, height: 1, backgroundColor: theme.colors.textMuted, transform: [{ rotate: `${connector.angle}deg` }] }} />}
          </View>;
        })}
      </View>
      {dayNumbers.map((day) => (
        <View key={day} style={[styles.dayColumn, { height: total, borderLeftColor: lineColor }]}>
          {cells.filter((cell) => cell.day === day).map((cell) => {
            const rect = cellRect(cell, heights);
            const category = resolveScheduleColor(cell.item.category, cell.item.colorKey, cell.item.title);
            // 시작·종료 시각은 왼쪽 시간 칼럼에서만 읽는다(일정 칸에는 시간 문자열을 남기지 않는다). range는 화면 읽기용 라벨에만 쓴다
            const current = nowMinutes != null && day === today && scheduleStatus(cell.item.startTime, cell.item.endTime, nowMinutes) === 'current';
            const highlighted = current || nowMinutes == null; // 현재 시각 정보가 없으면 예전처럼 모두 원래 색
            const range = `${cell.item.startTime}~${cell.item.endTime}`;
            // 진행 중이 아닌 칸은 배경과 글자를 모두 연하게 한다(글자는 읽을 수 있는 대비를 유지)
            const backgroundColor = highlighted ? category.backgroundColor : lightenColor(category.backgroundColor, 0.12);
            const textColor = readableScheduleText(backgroundColor);
            const roomForKind = rect.height >= titleLineHeight * fontScale * 3 + 8;
            const title = gridItemTitle(cell.item.title, !focus);
            // 칸 안쪽 = 요일 칸 폭 × 비율 − 띠 3dp·여백 2dp씩(진행 중이면 테두리 2dp씩 더). 폭을 아직 못 쟀으면 키우지 않는다
            const columnWidth = bodyWidth > 0 ? (bodyWidth - size.timeWidth) / dayNumbers.length : undefined;
            const border = current ? 2 : 0;
            const lines = title.split('\n');
            const titleSize = cellTitleFontSize({
              lines, move: isMoveTitle(cell.item.title), base: size.title, fontScale,
              widthDp: columnWidth != null ? columnWidth * rect.widthRatio - 7 - border : undefined,
              heightDp: rect.height - 4 - border * 2 - (roomForKind ? titleLineHeight * fontScale : 0),
            });
            // 키운 제목은 줄 수를 고정해, 어림값이 빗나가도 줄이 늘지 않고 원래 크기 쪽으로 줄어든다
            const boosted = titleSize > size.title;
            // 칸은 누르는 곳이 아니라 보는 곳이다: 스크롤하다 실수로 화면이 바뀌지 않게 이동은 요일 글자에서만 한다
            return <View
              key={cell.item.id}
              accessible
              accessibilityLabel={`${dayLabel(day)}요일 ${range} ${categoryText[cell.item.category]} ${cell.item.title}${cell.item.memo ? `, 메모: ${cell.item.memo}` : ''}${current ? (preview ? ', 지금 시각과 같은 시간대' : ', 지금 진행 중') : ''}`.replace(/\s+/g, ' ')}
              style={[styles.cell, {
                top: rect.top, height: rect.height, left: `${rect.leftRatio * 100}%`, width: `${rect.widthRatio * 100}%`,
                backgroundColor, borderLeftWidth: 3, borderLeftColor: scheduleStripeColor(cell.item.category, cell.item.title),
              }, current && { borderColor: textColor, borderWidth: 2 }]}
            >
              {roomForKind && <Text style={[styles.cellKind, { fontSize: size.title - 1, lineHeight: titleLineHeight, color: textColor }]} numberOfLines={1}>{categoryText[cell.item.category]}{cell.item.memo ? ' 📝' : ''}</Text>}
              <Text style={[styles.cellTitle, { fontSize: titleSize, lineHeight: Math.ceil(titleSize * 1.2), color: textColor }]} numberOfLines={boosted ? lines.length : 2} adjustsFontSizeToFit minimumFontScale={0.9 * size.title / titleSize}>{title}</Text>
            </View>;
          })}
        </View>
      ))}
    </View>}
    {unplaced.length > 0 && <View testID="schedule-footer" style={styles.unplaced} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      <Text style={[styles.unplacedTitle, { color: theme.colors.text }]}>시간을 알 수 없는 일정</Text>
      {unplaced.map(({ day, item }) => (
        <Text key={item.id} style={{ color: theme.colors.textMuted }}>{dayLabel(day)} · {item.title}</Text>
      ))}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  legendText: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11, fontWeight: '700' },
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
  cellTitle: { fontWeight: '700', includeFontPadding: false, textAlign: 'center', width: '100%' },
  unplaced: { gap: spacing.xs, paddingTop: spacing.md },
  unplacedTitle: { fontWeight: '700' },
});
