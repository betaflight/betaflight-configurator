!addplugindir /x86-ansi ".\NsisMultiUser\Plugins\x86-ansi\"
!addplugindir /x86-unicode ".\NsisMultiUser\Plugins\x86-unicode\"

!addincludedir ".\NsisMultiUser\Include\"

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "UnInst.nsh"

# Receives variables from the command line
# ${VERSION} - Version to generate (x.y.z)
# ${PLATFORM} - Platform to generate (win32 or win64)
# ${DEST_FOLDER} - Destination folder for the installer files

# Some definitions
!define SOURCE_FILES          "..\..\apps\betaflight-configurator\${PLATFORM}\*"
!define PRODUCT_NAME          "Betaflight Configurator"
!define COMPANY_NAME          "The Betaflight open source project."
!define GROUP_NAME            "Betaflight"
!define FOLDER_NAME           "Betaflight-Configurator"
!define PROGEXE               "betaflight-configurator-installer_${VERSION}_${PLATFORM}.exe"
!define FILE_NAME_UNINSTALLER "uninstall-betaflight-configurator.exe"
!define FILE_NAME_EXECUTABLE  "betaflight-configurator.exe"
!define LICENSE               "..\..\LICENSE"


Name "${PRODUCT_NAME}"
BrandingText "${COMPANY_NAME}"

# set the icon
!define MUI_ICON ".\bf_installer_icon.ico"
!define MUI_UNICON ".\bf_uninstaller_icon.ico"

#Define uninstall list name
!define UninstName "UninstallBF"

!define MULTIUSER_INSTALLMODE_ALLOW_ELEVATION 1
!define MULTIUSER_INSTALLMODE_ALLOW_BOTH_INSTALLATIONS 0
!define MULTIUSER_INSTALLMODE_INSTDIR "${FOLDER_NAME}"
!define MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY "${FOLDER_NAME}"
!define MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY "${FOLDER_NAME}"
!define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "UninstallString"
!define MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME "InstallLocation"

!include "NsisMultiUser.nsh" 

!include "MUI2.nsh"
!include "UAC.nsh"
!include "LogicLib.nsh"

# define the resulting installer's name:
OutFile "..\..\${DEST_FOLDER}\${PROGEXE}"

# app dialogs
!insertmacro MULTIUSER_PAGE_INSTALLMODE
!insertmacro MULTIUSER_UNPAGE_INSTALLMODE
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE ${LICENSE}
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

;!define MUI_FINISHPAGE_RUN "$INSTDIR\${FILE_NAME_EXECUTABLE}"

!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApplication

Function LaunchApplication ; Launching your app as the current user:
    SetOutPath $INSTDIR
    ; Needs the ShellExecAsUser plugin from http://nsis.sourceforge.net/ShellExecAsUser_plug-in
    ShellExecAsUser::ShellExecAsUser "" "$INSTDIR\${FILE_NAME_EXECUTABLE}" ""
FunctionEnd

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Catalan"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "Spanish"

# detect default install folder
Function .onInit

    # Check if older version
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
            "InstallLocation"

    ${If} $R0 != ""
        StrCpy $INSTDIR $R0
    ${Else}

        # Check if older version without administrative rights
        ReadRegStr $R1 HKCU "Software\${GROUP_NAME}\${PRODUCT_NAME}" \
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

    !insertmacro MULTIUSER_INIT
FunctionEnd

Function un.onInit
	!insertmacro MULTIUSER_UNINIT
FunctionEnd

# default section start
Section

    # remove the older version, users with admin rights
    ReadRegStr $R3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
            "InstallLocation"

    ${If} $R3 != ""
        # delete the installed files of the older version
        RMDir /r $R3
    ${Else}
        # remove the older version, users without admin rights
        ReadRegStr $R4 HKCU "Software\${GROUP_NAME}\${PRODUCT_NAME}" \
            "InstallLocation"

        ${If} $R4 != ""
            # delete the installed files of the older version
            !insertmacro INST_DELETE $R4 "${UninstName}"

            # remove installation folder if empty
            RMDir "$INSTDIR"

        ${EndIf}
    ${EndIf}

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

    # change uninstall list name
    !insertmacro UNINST_NAME "unins000BF"
 
    # store uninstaller data
    !insertmacro UNINSTALLER_DATA_END

    # create shortcuts in the start menu and on the desktop
    CreateDirectory "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}"    
    CreateShortCut "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${FILE_NAME_EXECUTABLE}"
    CreateShortCut "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${PRODUCT_NAME} (English).lnk" "$INSTDIR\${FILE_NAME_EXECUTABLE}" "--lang=en"
    CreateShortCut "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\${FILE_NAME_UNINSTALLER}"
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${FILE_NAME_EXECUTABLE}"

    # include in add/remove programs
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "Publisher" "${COMPANY_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "DisplayIcon" "$\"$INSTDIR\${FILE_NAME_EXECUTABLE}$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "UninstallString" "$\"$INSTDIR\${FILE_NAME_UNINSTALLER}$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "DisplayVersion" "${VERSION}"

    # include for users without admin rights
    WriteRegStr HKCU "Software\${GROUP_NAME}\${PRODUCT_NAME}" \
                "InstallLocation" "$INSTDIR"

    # estimate the size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
                "EstimatedSize" "$0"

    !insertmacro MULTIUSER_RegistryAddInstallInfo
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
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\${PRODUCT_NAME} (English).lnk"
    Delete "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}\Uninstall ${PRODUCT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${GROUP_NAME}\${FOLDER_NAME}"
    RMDir "$SMPROGRAMS\${GROUP_NAME}"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

    # remove from registry
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
    DeleteRegKey HKCU "Software\${GROUP_NAME}\${PRODUCT_NAME}"
    DeleteRegKey /ifempty HKCU "Software\${GROUP_NAME}"

    !insertmacro MULTIUSER_RegistryRemoveInstallInfo
SectionEnd
