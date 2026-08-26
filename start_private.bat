@echo off
set "SERVER_ROOT=<PRIVATE_SERVER_ROOT_PATH>\privato"
for /d %%i in ("%SERVER_ROOT%\bedrock-server-*") do (
    cd /d "%%i"
    goto :run
)

:run
bedrock_server.exe