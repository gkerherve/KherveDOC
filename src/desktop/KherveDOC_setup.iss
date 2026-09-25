; Inno Setup script for the KherveDOC desktop app.
; Produces a single Setup_KherveDOC_<version>.exe installer.
;
; Build steps (on Windows, from src\desktop):
;   1. pyinstaller KherveDOC.spec --noconfirm
;   2. ISCC.exe KherveDOC_setup.iss

#define MyAppName "KherveDOC"
#define MyAppPublisher "Gwilherm Kerherve"
#define MyAppURL "https://github.com/gkerherve/KherveDOC"
#define MyAppExeName "KherveDOC.exe"
#define MyAppVersion "0.1.0"

[Setup]
AppId={{5E0C7A21-3B9D-4F62-8E14-A7C2D90B6F38}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=installer
OutputBaseFilename=Setup_KherveDOC_{#MyAppVersion}
SetupIconFile=khervedoc_desktop\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\KherveDOC\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
