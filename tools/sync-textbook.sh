#!/bin/sh
# Копирует разобранный учебник из общей папки проекта в приложение.
# Запуск из корня репозитория: sh tools/sync-textbook.sh
SRC=${1:-/mnt/project-files/textbook}
mkdir -p textbook
cp "$SRC/contents.json" textbook/
cp -r "$SRC/lessons" textbook/
echo "Учебник обновлён: $(ls textbook/lessons | wc -l) уроков"
