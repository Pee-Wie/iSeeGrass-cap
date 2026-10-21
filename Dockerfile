FROM php:8.2-apache

# ── Force a clean MPM state ───────────────────────────────────────────────────
# The php:8.2-apache image on some builds has mpm_event AND mpm_prefork both
# active. We disable ALL MPM modules first by removing every mods-enabled entry
# that starts with "mpm_", then enable only mpm_prefork from scratch.
RUN find /etc/apache2/mods-enabled/ -name 'mpm_*' -delete \
 && ln -s /etc/apache2/mods-available/mpm_prefork.load \
          /etc/apache2/mods-enabled/mpm_prefork.load \
 && ln -s /etc/apache2/mods-available/mpm_prefork.conf \
          /etc/apache2/mods-enabled/mpm_prefork.conf \
 && apache2 -t 2>&1

# ── PHP extensions ────────────────────────────────────────────────────────────
RUN docker-php-ext-install mysqli pdo pdo_mysql

# ── mod_rewrite + AllowOverride for .htaccess ─────────────────────────────────
RUN a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# ── Application code ──────────────────────────────────────────────────────────
COPY . /var/www/html/

EXPOSE 80
