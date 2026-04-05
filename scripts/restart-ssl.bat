@echo off
echo Restarting Frontend Container to apply new SSL certificates...
docker-compose -f docker-compose.production.yml restart frontend
echo Done!
pause