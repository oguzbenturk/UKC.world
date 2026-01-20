#!/bin/bash
docker exec plannivo_db_1 psql -U plannivo -d plannivo -c "SELECT u.id, u.email, u.name, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE r.name = 'student' LIMIT 3;"
