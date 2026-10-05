// 앱 진입점. 화면 없이 실행되는 작업은 화면(라우트)을 그리기 전에 등록해야 하므로 여기서 먼저 불러온 뒤 Expo Router를 시작한다.
import './src/widgets/widgetHeadlessTask';
import './src/notifications/backgroundRollingRefresh';
import 'expo-router/entry';
