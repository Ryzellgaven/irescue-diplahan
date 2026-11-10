FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app
RUN npm install --global pnpm@10.10.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV VITE_API_URL=/api/index.php
RUN pnpm build

FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install fileinfo mbstring pdo_mysql \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/apache-ports.conf /etc/apache2/ports.conf
COPY docker/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/render.ini
COPY docker/entrypoint.sh /usr/local/bin/render-entrypoint
RUN chmod +x /usr/local/bin/render-entrypoint

COPY --from=frontend-build /app/dist/ /var/www/html/
COPY backend/api/ /var/www/html/api/
COPY backend/deploy/healthz.php /var/www/html/healthz.php
COPY backend/ /opt/ldrrmo/backend/
COPY .htaccess /var/www/html/.htaccess

ENV PORT=10000 \
    LDRRMO_PRIVATE_UPLOAD_DIR=/var/data/report-uploads

ENTRYPOINT ["render-entrypoint"]
