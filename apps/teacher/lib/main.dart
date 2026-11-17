import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'teach.dart';

Future<void> main() => runCnhsApp(role: Role.teacher, title: 'CNHS Teacher', home: (c) => const TeacherShell());

class TeacherShell extends StatelessWidget {
  const TeacherShell({super.key});
  @override Widget build(BuildContext c) {
    final s = Scope.of(c), writer = s.me?['isWriter'] == true;
    final hubs = <Hub>[
      Hub('Home', Icons.home_outlined, [PageDef('Today', (c) => HomePage((a, b) {}))]),
      Hub('My classes', Icons.groups_outlined, [PageDef('My sections', (c) => const SectionsPage()), PageDef('Schedule', (c) => const SchedulePage()), PageDef('Lesson log', (c) => const LessonsPage())]),
      Hub('Grading', Icons.grading_outlined, [PageDef('Class record', (c) => const RecordPage()), PageDef('Term grades', (c) => const GradesPage())]),
      Hub('Attendance', Icons.event_available_outlined, [PageDef('Class attendance', (c) => const ClassAttendancePage()), PageDef('Absence watch', (c) => const StandingPage()), PageDef('Homeroom', (c) => const HomeroomPage())]),
      Hub('Messages', Icons.campaign_outlined, [PageDef('Announcements', (c) => const AnnouncementsPage('teacher')), PageDef('School notices', (c) => const NoticesPage())]),
      Hub('Publications', Icons.article_outlined, [PageDef('Read and react', (c) => const PubReadList('teacher')), if (writer) PageDef('My articles', (c) => const PubManagePage('teacher'))]),
      Hub('Activity log', Icons.history, [PageDef('My activity', (c) => const LogsPage('teacher'))]),
      Hub('My account', Icons.person_outline, [PageDef('Profile', (c) => const ProfilePage()), PageDef('Password', (c) => const PasswordPage())]),
    ];
    return AppShell(portalTitle: 'CNHS Teacher Portal', brand1: 'Calape NHS', brand2: 'Teacher portal', who: s.name, roleLine: 'Teacher', footLabel: 'Teacher ID', footValue: '${s.me?['teacherNo'] ?? ''}', hubs: hubs);
  }
}
