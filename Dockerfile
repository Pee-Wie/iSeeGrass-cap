FROM php:8.2-apache-bullseye

# php:8.2-apache-bullseye (Debian 11) ships with only mpm_prefork enabled
# by default — no dual-MPM conflict.

# ── PHP extensions ────────────────────────────────────────────────────────────
RUN docker-php-ext-install mysqli pdo pdo_mysql

# ── mod_rewrite + AllowOverride ───────────────────────────────────────────────
RUN a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# ── Application code ──────────────────────────────────────────────────────────
COPY . /var/www/html/

EXPOSE 80
