@echo off
set "SERVER_ROOT=<PUBLIC_SERVER_ROOT_PATH>\bedrock_server"
for /d %%i in ("%SERVER_ROOT%\bedrock-server-*") do (
    cd /d "%%i"
    goto :run
)

:run
bedrock_server.exe