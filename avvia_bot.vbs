Set WshShell = CreateObject("WScript.Shell")

' Start the bot in hidden mode (0)
WshShell.Run "cmd.exe /c cd /d <BOT_FOLDER_PATH> && node bot.js", 0, False

' Show the Windows push notification (PowerShell)
psCommand = "powershell -Command ""& {Add-Type -AssemblyName System.Windows.Forms; [System.Windows.MessageBox]::Show('The Minecraft bot started successfully!', 'Bot Status');}"""
' If you prefer a notification that disappears automatically after 10 seconds:
psToast = "powershell -Command ""& {$w = New-Object -ComObject WScript.Shell; $w.Popup('Bot is online and operational!', 10, 'Bot Status', 64)}"""

WshShell.Run psToast, 0, False