#!/bin/sh
set -eu

case "${PORT:-10000}" in
    ''|*[!0-9]*)
        echo "PORT must be a valid TCP port number." >&2
        exit 1
        ;;
esac

sed -i "s/@@PORT@@/${PORT:-10000}/g" \
    /etc/apache2/ports.conf \
    /etc/apache2/sites-available/000-default.conf

mkdir -p "$LDRRMO_PRIVATE_UPLOAD_DIR" /var/data/php-sessions
chown -R www-data:www-data "$LDRRMO_PRIVATE_UPLOAD_DIR" /var/data/php-sessions

exec apache2-foreground
