#ifndef AppVersion
  #define AppVersion "2.0.2"
#endif

[Setup]
AppId={{8F4C7B2E-9D1A-4E6B-A3F0-2C5E9B81D4A7}
AppName=NSW Game Catalog
AppVersion={#AppVersion}
AppPublisher=Daddelgreis74
AppPublisherURL=https://github.com/Daddelgreis74/switch-game-catalog
DefaultDirName={localappdata}\Programs\NSW Game Catalog
DefaultGroupName=NSW Game Catalog
AllowNoIcons=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=SwitchGameCatalog-Setup-{#AppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={app}\NSWGameCatalog.exe
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[CustomMessages]
english.ConfigPageTitle=Library & Server Configuration
english.ConfigPageSubTitle=Choose where your Switch games and prod.keys are located.
english.GamesDirPrompt=Select your Nintendo Switch games folder (GAMES_DIR):
english.KeysFilePrompt=Optional: Select your prod.keys file (or leave empty to upload via Web UI later):
english.PortPageTitle=Web Server Port
english.PortPageSubTitle=Choose the TCP port for the web interface.
english.PortPrompt=Web Port (default 3000):
english.DesktopIcon=Create a &desktop shortcut
english.LaunchApp=Start NSW Game Catalog now

german.ConfigPageTitle=Bibliothek & Server konfigurieren
german.ConfigPageSubTitle=Wähle den Speicherort für deine Switch-Spiele und prod.keys.
german.GamesDirPrompt=Ordner für Nintendo Switch-Spiele wählen (GAMES_DIR):
german.KeysFilePrompt=Optional: prod.keys-Datei auswählen (oder leer lassen und später im Browser hochladen):
german.PortPageTitle=Webserver-Port
german.PortPageSubTitle=Wähle den TCP-Port für die Weboberfläche.
german.PortPrompt=Web-Port (Standard 3000):
german.DesktopIcon=&Desktop-Verknüpfung erstellen
german.LaunchApp=NSW Game Catalog jetzt starten

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist-win\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\config"
Name: "{app}\bin"
Name: "{app}\public\cache"

[Icons]
Name: "{group}\NSW Game Catalog"; Filename: "{app}\NSWGameCatalog.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,NSW Game Catalog}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\NSW Game Catalog"; Filename: "{app}\NSWGameCatalog.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\NSWGameCatalog.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent

[Code]
var
  GamesDirPage: TInputDirWizardPage;
  KeysFilePage: TInputFileWizardPage;
  PortPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  GamesDirPage := CreateInputDirPage(
    wpSelectDir,
    ExpandConstant('{cm:ConfigPageTitle}'),
    ExpandConstant('{cm:ConfigPageSubTitle}'),
    ExpandConstant('{cm:GamesDirPrompt}'),
    False,
    'SwitchGames'
  );
  GamesDirPage.Add('');
  GamesDirPage.Values[0] := ExpandConstant('{userdocs}\SwitchGames');

  KeysFilePage := CreateInputFilePage(
    GamesDirPage.ID,
    ExpandConstant('{cm:ConfigPageTitle}'),
    ExpandConstant('{cm:ConfigPageSubTitle}'),
    ExpandConstant('{cm:KeysFilePrompt}')
  );
  KeysFilePage.Add('prod.keys:', 'Key files (*.keys;*.txt)|*.keys;*.txt|All files (*.*)|*.*', '.keys');
  KeysFilePage.Values[0] := '';

  PortPage := CreateInputQueryPage(
    KeysFilePage.ID,
    ExpandConstant('{cm:PortPageTitle}'),
    ExpandConstant('{cm:PortPageSubTitle}'),
    ''
  );
  PortPage.Add(ExpandConstant('{cm:PortPrompt}'), False);
  PortPage.Values[0] := '3000';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  GamesDir, KeysPath, PortVal, EnvContent: String;
  PortNum: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    GamesDir := Trim(GamesDirPage.Values[0]);
    if GamesDir = '' then
      GamesDir := ExpandConstant('{app}\games');

    if not DirExists(GamesDir) then
      ForceDirectories(GamesDir);

    KeysPath := Trim(KeysFilePage.Values[0]);
    if KeysPath = '' then
      KeysPath := ExpandConstant('{app}\config\prod.keys');

    PortVal := Trim(PortPage.Values[0]);
    PortNum := StrToIntDef(PortVal, 3000);
    if (PortNum < 1) or (PortNum > 65535) then
      PortNum := 3000;
    PortVal := IntToStr(PortNum);

    EnvContent :=
      'PORT=' + PortVal + #13#10 +
      'GAMES_DIR=' + GamesDir + #13#10 +
      'KEYS_PATH=' + KeysPath + #13#10 +
      'DB_PATH=' + ExpandConstant('{app}\config\games_db.json') + #13#10 +
      'SQLITE_PATH=' + ExpandConstant('{app}\config\catalog.db') + #13#10;

    SaveStringToFile(ExpandConstant('{app}\.env'), EnvContent, False);
  end;
end;
