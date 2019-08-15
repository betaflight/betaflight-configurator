!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "UnInst.nsh"

# Receives variables from the command line
# ${VERSION} - Version to generate (x.y.z)
# ${PLATFORM} - Platform to generate (win32 or win64)
# ${DEST_FOLDER} - Destination folder for the installer files

# Some definitions
!define SOURCE_FILES          "..\..\apps\betaflight-configurator\${PLATFORM}\*"
!define APP_NAME              "Betaflight Configurator"
!define COMPANY_NAME          "The Betaflight open source project."
!define GROUP_NAME            "Betaflight"
!define FOLDER_NAME           "Betaflight-Configurator"
!define FILE_NAME_INSTALLER   "betaflight-configurator-installer_${VERSION}_${PLATFORM}.exe"
!define FILE_NAME_UNINSTALLER "uninstall-betaflight-configurator.exe"
!define FILE_NAME_EXECUTABLE  "betaflight-configurator.exe"
!define LICENSE               "..\..\LICENSE"


Name "${APP_NAME}"
BrandingText "${COMPANY_NAME}"

# set the icon
!define MUI_ICON ".\bf_installer_icon.ico"
!define MUI_UNICON ".\bf_uninstaller_icon.ico"

#Define uninstall list name
!define UninstName "uninbf00"

# Request rights user level
RequestExecutionLevel highest

# define the resulting installer's name:
OutFile "..\..\${DEST_FOLDER}\${FILE_NAME_INSTALLER}"

# app dialogs
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE ${LICENSE}
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${FILE_NAME_EXECUTABLE}"

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Catalan"
!insertmacro MUI_LANGUAGE "Croatian"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "Galician"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "Indonesian"
!insertmacro MUI_LANGUAGE "Italian"
!insertmacro MUI_LANGUAGE "Japanese"
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "Latvian"
!insertmacro MUI_LANGUAGE "Portuguese"
!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "Swedish"

# detect default install folder
Function .onInit

    # Check if older version
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
            "InstallLocation"

    ${If} $R0 != ""
        StrCpy $INSTDIR $R0
    ${Else}

        # Check if older version without administrative rights
        ReadRegStr $R1 HKCU "Software\${GROUP_NAME}\${APP_NAME}" \
            "InstallLocation"

        ${If} $R1 != ""
            StrCpy $INSTDIR $R1
        ${Else}

            # New version, select default folder
            UserInfo::GetAccountType
            Pop $R2
            
            ${If} $R2 == "Admin"
                # set the default installation directory
                !if ${PLATFORM} == 'win64'
                        StrCpy $INSTDIR "$PROGRAMFILES64\${GROUP_NAME}\${FOLDER_NAME}\" 
                !else
                        StrCpy $INSTDIR "$PROGRAMFILES\${GROUP_NAME}\${FOLDER_NAME}\" 
                !endif
            ${Else}
                StrCpy $INSTDIR "$DOCUMENTS\${GROUP_NAME}\${FOLDER_NAME}\"
            ${Endif}
        ${Endif}
    ${Endif}

FunctionEnd

# default section start
Section

    # remove the older version, users with admin rights
    ReadRegStr $R3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
            "InstallLocation"

    ${If} $R3 != ""
        # delete the installed files of the older version
        !insertmacro INST_DELETE $R3 "${UninstName}"

        # remove installation folder if empty
        RMDir "$R3"

    ${Else}
        # remove the older version, users without admin rights
        ReadRegStr $R4 HKCU "Software\${GROUP_NAME}\${APP_NAME}" \
            "InstallLocation"

        ${If} $R4 != ""
            # delete the installed files of the older version
            !insertmacro INST_DELETE $R4 "${UninstName}"

            # remove installation folder if empty
            RMDir "$R4"

        ${EndIf}
    ${EndIf}

    # the english shortcut is not installed in actual versions, remove the deletion in a future release
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${APP_NAME} (English).lnk"

    # if the registry entries did not exist, we ignore the errors
    ClearErrors

    # define the path to which the installer should install
    SetOutPath $INSTDIR

    # create an exclusion list for the uninstaller
    !insertmacro UNINSTALLER_DATA_BEGIN

    # specify the files to go in the output path
    File /r ${SOURCE_FILES}

    # create the uninstaller
    WriteUninstaller "$INSTDIR\${FILE_NAME_UNINSTALLER}"

    # store uninstaller data
    !insertmacro UNINSTALLER_DATA_END

    # create shortcuts in the start menu and on the desktop
    CreateDirectory "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}"    
    CreateShortCut "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${APP_NAME}.lnk" "$INSTDIR\${FILE_NAME_EXECUTABLE}" "" "$INSTDIR\images\bf_icon.ico" "0" "" "" ""
    CreateShortCut "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\${FILE_NAME_UNINSTALLER}"
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${FILE_NAME_EXECUTABLE}" "" "$INSTDIR\images\bf_icon.ico" "0" "" "" ""

    # include in add/remove programs
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "Publisher" "${COMPANY_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "DisplayIcon" "$\"$INSTDIR\${FILE_NAME_EXECUTABLE}$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "UninstallString" "$\"$INSTDIR\${FILE_NAME_UNINSTALLER}$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "DisplayVersion" "${VERSION}"

    # include for users without admin rights
    WriteRegStr HKCU "Software\${GROUP_NAME}\${APP_NAME}" \
                "InstallLocation" "$INSTDIR"

    # estimate the size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                "EstimatedSize" "$0"


SectionEnd

# create a section to define what the uninstaller does
Section "Uninstall"

    # terminate uninstaller if the .dat file does not exist
    !define UNINST_TERMINATE
 
    # delete files
    !insertmacro UNINST_DELETE "$INSTDIR" "${UninstName}"
 
    # remove installation folder if it is empty
    RMDir "$INSTDIR"

    # delete the shortcuts
    # the english shortcut is not installed in actual versions, remove the deletion in a future release
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${APP_NAME}.lnk"
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${APP_NAME} (English).lnk"
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\Uninstall ${APP_NAME}.lnk"
    RMDir "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}"
    RMDir "$SMPROGRAMS\${GROUP_NAME}"
    Delete "$DESKTOP\${APP_NAME}.lnk"

    # remove from registry
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
    DeleteRegKey HKCU "Software\${GROUP_NAME}\${APP_NAME}"
    DeleteRegKey /ifempty HKCU "Software\${GROUP_NAME}"

SectionEnd
