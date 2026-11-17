import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'people.dart';
import 'classes.dart';
import 'records.dart';
import 'system.dart';

Future<void> main() => runCnhsApp(role: Role.admin, title: 'CNHS Staff', home: (c) => const AdminShell());

class AdminShell extends StatelessWidget {
  const AdminShell({super.key});
  @override Widget build(BuildContext c) {
    final s = Scope.of(c), mods = ((s.me?['modules'] as List?) ?? []).cast<String>(), all = mods.contains('*');
    bool can(String m) => all || mods.contains(m);
    // The dashboard needs to jump to other pages; the shell key lets it do so.
    final hubs = <Hub>[
      if (can('index')) Hub('Dashboard', Icons.dashboard_outlined, [PageDef('Dashboard', (c) => DashboardPage((a, b) {}))]),
      if (can('students') || can('teachers')) Hub('People', Icons.people_outline, [if (can('students')) PageDef('Students', (c) => const StudentsPage()), if (can('teachers')) PageDef('Teachers', (c) => const TeachersPage())]),
      if (can('sections') || can('subjects') || can('schedule') || can('years')) Hub('Classes', Icons.school_outlined, [if (can('sections')) PageDef('Sections', (c) => const SectionsPage()), if (can('subjects')) PageDef('Subjects', (c) => const SubjectsPage()), if (can('schedule')) PageDef('Schedules', (c) => const SchedulePage()), if (can('years')) PageDef('School years', (c) => const YearsPage())]),
      if (can('grades') || can('attendance') || can('reports')) Hub('Records', Icons.fact_check_outlined, [if (can('grades')) PageDef('Grades', (c) => const GradesPage()), if (can('attendance')) PageDef('Attendance', (c) => const AttendancePage()), if (can('reports')) PageDef('Reports', (c) => const ReportsPage())]),
      if (can('notices') || can('announcements')) Hub('Messages', Icons.campaign_outlined, [if (can('notices')) PageDef('Notices', (c) => const NoticesPage()), if (can('announcements')) PageDef('Announcements', (c) => const AnnouncementsPage('admin'))]),
      if (can('publications')) Hub('Publications', Icons.article_outlined, [PageDef('Articles', (c) => const PubManagePage('admin')), PageDef('Faculty writers', (c) => const WritersPage())]),
      if (can('users') || can('logs') || can('migrate')) Hub('System', Icons.settings_outlined, [if (can('users')) PageDef('Staff users', (c) => const UsersPage()), if (can('logs')) PageDef('Activity logs', (c) => const LogsPage('admin')), if (can('migrate')) PageDef('ID migration', (c) => const MigratePage())]),
      Hub('My account', Icons.person_outline, [PageDef('Change password', (c) => const PasswordPage())]),
    ];
    return AppShell(portalTitle: 'CNHS Staff Portal', brand1: 'Calape NHS', brand2: 'Staff portal', who: s.name, roleLine: '${s.me?['roleLabel'] ?? ''}', footLabel: 'Signed in as', footValue: '${s.me?['username'] ?? ''}', hubs: hubs);
  }
}
