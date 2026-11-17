#!/usr/bin/env python3
"""Patches the Android project that `flutter create` generates so the app can keep a live connection and show notifications WITHOUT Firebase.
Usage: patch_android.py <android_dir> "<App label>"
Adds: permissions, the background-service declaration (Android 14 needs the dataSync type), minSdk 23, and core library desugaring
(required by flutter_local_notifications). Safe to run twice."""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1]); label = sys.argv[2]

# ---- AndroidManifest.xml ----
mf = root / 'app/src/main/AndroidManifest.xml'
s = mf.read_text()
if 'xmlns:tools' not in s:
    s = s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
perms = ['INTERNET', 'POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK']
add = ''.join(f'    <uses-permission android:name="android.permission.{p}"/>\n' for p in perms if f'android.permission.{p}"' not in s)
if add:
    s = s.replace('<application', add + '    <application', 1)
s = re.sub(r'android:label="[^"]*"', f'android:label="{label}"', s, count=1)
svc = '''        <service android:name="id.flutter.flutter_background_service.BackgroundService"
            android:foregroundServiceType="dataSync" android:exported="true" tools:replace="android:exported"/>
'''
if 'flutter_background_service.BackgroundService' not in s:
    s = s.replace('</application>', svc + '    </application>', 1)
mf.write_text(s)

# ---- app/build.gradle(.kts) ----
for name in ('app/build.gradle.kts', 'app/build.gradle'):
    g = root / name
    if not g.exists():
        continue
    t = g.read_text(); kts = name.endswith('.kts')
    t = re.sub(r'minSdk(Version)?\s*=?\s*flutter\.minSdkVersion', ('minSdk = 23' if kts else 'minSdkVersion 23'), t)
    if 'oreLibraryDesugaring' not in t:
        if kts:
            t = re.sub(r'(compileOptions\s*\{)', r'\1\n        isCoreLibraryDesugaringEnabled = true', t, count=1)
            t += '\n\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n'
        else:
            t = re.sub(r'(compileOptions\s*\{)', r'\1\n        coreLibraryDesugaringEnabled true', t, count=1)
            t += "\n\ndependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'\n}\n"
    g.write_text(t)
print('Android project patched for', label)
