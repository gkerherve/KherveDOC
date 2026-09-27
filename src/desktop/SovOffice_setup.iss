; Inno Setup script for the Sovereign Office desktop app.
; Produces a single Setup_SovOffice_<version>.exe installer.
;
; Build steps (on Windows, from src\desktop):
;   1. pyinstaller SovOffice.spec --noconfirm
;   2. ISCC.exe SovOffice_setup.iss

#define MyAppName "Sovereign Office"
#define MyAppPublisher "Gwilherm Kerherve"
#define MyAppURL "https://github.com/gkerherve/SovereignOffice"
#define MyAppExeName "SovOffice.exe"
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
OutputBaseFilename=Setup_SovOffice_{#MyAppVersion}
SetupIconFile=sovoffice_desktop\icon.ico
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
Source: "dist\SovOffice\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
