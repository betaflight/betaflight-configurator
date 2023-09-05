; ------------------------------------------
; Installer for Betaflight Configurator
; ------------------------------------------
; It receives from the command line with /D the parameters: 
; version
; archName
; archAllowed
; archInstallIn64bit
; sourceFolder
; targetFolder

#define ApplicationName "Betaflight Configurator"
#define CompanyName "The Betaflight open source project"
#define CompanyUrl "https://betaflight.com/"
#define ExecutableFileName "betaflight-configurator.exe"
#define GroupName "Betaflight"
#define InstallerFileName "betaflight-configurator_" + version + "_" + archName + "-installer"
#define SourcePath "..\..\" + sourceFolder + "\betaflight-configurator\" + archName
#define TargetFolderName "Betaflight-Configurator"
#define UpdatesUrl "https://github.com/betaflight/betaflight-configurator/releases"

[CustomMessages]
AppName=betaflight-configurator
LaunchProgram=Start {#ApplicationName}

[Files]
Source: "{#SourcePath}\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
; Programs group
Name: "{group}\{#ApplicationName}"; Filename: "{app}\{#ExecutableFileName}";
; Desktop icon
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\{#ExecutableFileName}"; 
; Non admin users, uninstall icon
Name: "{group}\Uninstall {#ApplicationName}"; Filename: "{uninstallexe}"; Check: not IsAdminInstallMode

[Languages]
; English default, it must be first
Name: "en"; MessagesFile: "compiler:Default.isl"
; Official languages
Name: "ca"; MessagesFile: "compiler:Languages\Catalan.isl"
Name: "da"; MessagesFile: "compiler:Languages\Danish.isl"
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "ja"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "nl"; MessagesFile: "compiler:Languages\Dutch.isl"
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"
Name: "pl"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "uk"; MessagesFile: "compiler:Languages\Ukrainian.isl"
; Not official. Sometimes not updated to latest version (strings missing)
Name: "ga"; MessagesFile: "unofficial_inno_languages\Galician.isl"
Name: "eu"; MessagesFile: "unofficial_inno_languages\Basque.isl"
Name: "hr"; MessagesFile: "unofficial_inno_languages\Croatian.isl"
Name: "hu"; MessagesFile: "unofficial_inno_languages\Hungarian.isl"
Name: "id"; MessagesFile: "unofficial_inno_languages\Indonesian.isl"
Name: "ko"; MessagesFile: "unofficial_inno_languages\Korean.isl"
Name: "lv"; MessagesFile: "unofficial_inno_languages\Latvian.isl"
Name: "sv"; MessagesFile: "unofficial_inno_languages\Swedish.isl"
Name: "zh_CN"; MessagesFile: "unofficial_inno_languages\ChineseSimplified.isl"
Name: "zh_TW"; MessagesFile: "unofficial_inno_languages\ChineseTraditional.isl"
; Not available
; pt_BR (Portuguese Brasileiro)

[Run]
; Add a checkbox to start the app after installed
Filename: {app}\{cm:AppName}.exe; Description: {cm:LaunchProgram,{cm:AppName}}; Flags: nowait postinstall skipifsilent

[Setup]
AppId=e72c90bb-45eb-48dc-9cf3-ac2e8ec52f8c
AppName={#ApplicationName}
AppPublisher={#CompanyName}
AppPublisherURL={#CompanyUrl}
AppUpdatesURL={#UpdatesUrl}
AppVersion={#version}
ArchitecturesAllowed={#archAllowed}
ArchitecturesInstallIn64BitMode={#archInstallIn64bit}
Compression=lzma2
DefaultDirName={autopf}\{#GroupName}\{#TargetFolderName}
DefaultGroupName={#GroupName}\{#ApplicationName}
LicenseFile=..\..\LICENSE
MinVersion=6.2
OutputBaseFilename={#InstallerFileName}
OutputDir=..\..\{#targetFolder}\
PrivilegesRequiredOverridesAllowed=commandline dialog
SetupIconFile=bf_installer_icon.ico
ShowLanguageDialog=yes
SolidCompression=yes
UninstallDisplayIcon={app}\{#ExecutableFileName}
UninstallDisplayName={#ApplicationName}
WizardImageFile=bf_installer.bmp
WizardSmallImageFile=bf_installer_small.bmp
WizardStyle=modern

[Code]
function GetOldNsisUninstallerPath(): String;
var
    RegKey: String;
begin
    Result := '';
    // Look into the different registry entries: win32, win64 and without user rights
    if not RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Betaflight Configurator', 'UninstallString', Result) then
    begin
        if not RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Betaflight Configurator', 'UninstallString', Result) then
        begin
            RegQueryStringValue(HKCU, 'SOFTWARE\Betaflight\Betaflight Configurator', 'UninstallString', Result)
        end;
    end;
end;

function GetQuietUninstallerPath(): String;
var
    RegKey: String;
begin
    Result := '';
    RegKey := Format('%s\%s_is1', ['Software\Microsoft\Windows\CurrentVersion\Uninstall', '{#emit SetupSetting("AppId")}']);
    if not RegQueryStringValue(HKEY_LOCAL_MACHINE, RegKey, 'QuietUninstallString', Result) then
    begin
        RegQueryStringValue(HKEY_CURRENT_USER, RegKey, 'QuietUninstallString', Result);
    end;
end;

function InitializeSetup(): Boolean;
var
    ResultCode: Integer;
    ParameterStr : String;
    UninstPath : String;
begin
    
    Result := True;

    // Check if the application is already installed by the old NSIS installer, and uninstall it
    UninstPath := GetOldNsisUninstallerPath();

    // Found, start uninstall
    if UninstPath <> '' then 
    begin
        
        UninstPath := RemoveQuotes(UninstPath);

        // Add this parameter to not return until uninstall finished. The drawback is that the uninstaller file is not deleted
        ParameterStr := '_?=' + ExtractFilePath(UninstPath);

        if Exec(UninstPath, ParameterStr, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
        begin
          // Delete the unistaller file and empty folders. Not deleting the files.
          DeleteFile(UninstPath);
          DelTree(ExtractFilePath(UninstPath), True, False, True);
        end
        else begin
            Result := False;
            MsgBox('Error uninstalling old Configurator ' + SysErrorMessage(ResultCode) + '.', mbError, MB_OK);
        end;        
    end
    else begin

        // Search for new Inno Setup installations
        UninstPath := GetQuietUninstallerPath();
        if UninstPath <> '' then
        begin
            if not Exec('>', UninstPath, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
            begin
                Result := False;
                MsgBox('Error uninstalling Configurator ' + SysErrorMessage(ResultCode) + '.', mbError, MB_OK);
            end;
        end;
    end;
end;