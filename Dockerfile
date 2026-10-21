FROM php:8.2-apache

# ── PHP extensions ────────────────────────────────────────────────────────────
RUN docker-php-ext-install mysqli pdo pdo_mysql

# ── Fix MPM conflict ──────────────────────────────────────────────────────────
# Disable mpm_event (default in this image), enable mpm_prefork (required for
# the standard PHP SAPI which is not thread-safe).
RUN a2dismod mpm_event || true
RUN a2enmod mpm_prefork

# ── mod_rewrite + AllowOverride for .htaccess ─────────────────────────────────
RUN a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# ── Application code ──────────────────────────────────────────────────────────
COPY . /var/www/html/

EXPOSE 80
