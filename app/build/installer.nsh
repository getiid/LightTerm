!macro KillAstraShell
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM AstraShell.exe'
  Pop $0
!macroend

!macro customInit
  !insertmacro KillAstraShell
!macroend

!macro customUnInit
  !insertmacro KillAstraShell
!macroend

!macro customUnInstall
  !insertmacro KillAstraShell
!macroend

!macro customUnInstallCheck
  StrCmp $R0 0 done
  DetailPrint "Previous uninstaller exited with code $R0. Continue with forced cleanup."
  !insertmacro KillAstraShell
  ClearErrors
  StrCpy $R0 0
done:
!macroend
