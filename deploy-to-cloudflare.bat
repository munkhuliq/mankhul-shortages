@echo off
chcp 65001 > nul
title رفع وتحديث نظام منخل إلى Cloudflare Workers
echo ===================================================================
echo     جاري رفع نظام نقوصات مقهى منخل إلى Cloudflare Workers...
echo ===================================================================
echo.
cd /d "d:\نقوصات منخل"
set CLOUDFLARE_ACCOUNT_ID=37d7c59a191abea5aeaaba8d66a827e5
call .\node_modules\.bin\wrangler.cmd deploy
echo.
echo ===================================================================
echo  تم الرفع والنشر بنجاح إلى كلاودفلاير ووركرز!
echo  الرابط: https://mankhul-shortages.munkhul-iq.workers.dev
echo ===================================================================
pause
