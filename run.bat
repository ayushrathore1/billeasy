@echo off
title BillEasy Dev Server
echo ============================================
echo   BillEasy - Starting Dev Environment
echo ============================================
echo.

:: Set up PATH
set PATH=%PATH%;C:\Program Files\nodejs;%USERPROFILE%\.cargo\bin

:: IMPORTANT: Use local C: drive for target to avoid file-lock issues on external drives
set CARGO_TARGET_DIR=C:\Users\Lenovo\.cargo\billeasy-target

:: Verify tools
echo [1/3] Verifying toolchain...
where cargo >nul 2>&1 || (echo ERROR: cargo not found! && goto :fail)
where node >nul 2>&1 || (echo ERROR: node not found! && goto :fail)
echo    All tools OK
echo.

:: Pre-build Rust binary
echo [2/3] Pre-building Rust backend...
cd /d X:\BillEasy\src-tauri
call cargo build 2>&1
if errorlevel 1 (
    echo    Build failed, retrying...
    call cargo build 2>&1
    if errorlevel 1 goto :fail
)
echo    Rust build OK!
echo.

:: Launch Tauri dev
echo [3/3] Starting BillEasy...
cd /d X:\BillEasy
call npm run tauri -- dev

:fail
echo.
echo ============================================
echo   BillEasy exited. Check errors above.
echo ============================================
pause
