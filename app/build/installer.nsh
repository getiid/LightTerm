!macro customInit
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM AstraShell.exe'
  Pop $0
!macroend
