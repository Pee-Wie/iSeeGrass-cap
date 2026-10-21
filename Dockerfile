FROM php:8.2-apache

# ── MPM fix ───────────────────────────────────────────────────────────────────
# Remove mpm_event and mpm_worker symlinks from mods-enabled.
# mpm_prefork is already present (confirmed in build logs).
# This runs BEFORE COPY so no project files interfere.
RUN rm -f /etc/apache2/mods-enabled/mpm_event.load \
          /etc/apache2/mods-enabled/mpm_event.conf \
          /etc/apache2/mods-enabled/mpm_worker.load \
          /etc/apache2/mods-enabled/mpm_worker.conf

# ── PHP extensions ────────────────────────────────────────────────────────────
RUN docker-php-ext-install mysqli pdo pdo_mysql

# ── mod_rewrite + AllowOverride ───────────────────────────────────────────────
RUN a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# ── Application code ──────────────────────────────────────────────────────────
# Exclude the docker/ directory — it contains only build helpers, not web files.
COPY . /var/www/html/

# Remove any build helper files that were copied in but shouldn't be served.
RUN rm -rf /var/www/html/docker

EXPOSE 80
