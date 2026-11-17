import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'pages.dart';

Future<void> main() => runCnhsApp(role: Role.student, title: 'CNHS Student', home: (c) => const StudentShell());

class StudentShell extends StatelessWidget {
  const StudentShell({super.key});
  @override Widget build(BuildContext c) {
    final s = Scope.of(c);
    final hubs = <Hub>[
      Hub('Home', Icons.home_outlined, [PageDef('Home', (c) => const HomePage())]),
      Hub('My grades', Icons.grading_outlined, [PageDef('My grades', (c) => const GradesPage())]),
      Hub('Attendance', Icons.event_available_outlined, [PageDef('Attendance', (c) => const AttendancePage())]),
      Hub('Class schedule', Icons.calendar_month_outlined, [PageDef('Class schedule', (c) => const SchedulePage())]),
      Hub('Feed', Icons.campaign_outlined, [PageDef('Notices and updates', (c) => const FeedPage())]),
      Hub('My account', Icons.person_outline, [PageDef('Profile', (c) => const ProfilePage()), PageDef('Password', (c) => const PasswordPage())]),
    ];
    return AppShell(portalTitle: 'CNHS Student Portal', brand1: 'Calape NHS', brand2: 'Student portal', who: s.name, roleLine: 'Grade ${s.me?['gradeLevel'] ?? ''}', footLabel: 'Student ID', footValue: '${s.me?['studentNo'] ?? ''}', hubs: hubs);
  }
}
