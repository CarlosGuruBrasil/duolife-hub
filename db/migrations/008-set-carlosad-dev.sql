-- Migration: 008-set-carlosad-dev.sql
-- Promove o usuário carlosad1981@gmail.com para desenvolvedor (duolife_dev)

UPDATE admin_users
SET role = 'duolife_dev'
WHERE LOWER(TRIM(email)) = 'carlosad1981@gmail.com';
