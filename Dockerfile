FROM php:8.2-apache-bullseye

# ── PHP extensions ────────────────────────────────────────────────────────────
RUN docker-php-ext-install mysqli pdo pdo_mysql

# ── mod_rewrite + AllowOverride ───────────────────────────────────────────────
RUN a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# ── Fix MPM at runtime via custom entrypoint ──────────────────────────────────
# Railway's environment somehow ends up with two MPMs active at container start.
# This entrypoint removes all mpm_* symlinks and re-enables only mpm_prefork
# immediately before apache2-foreground runs — after any Railway env injection.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ── Application code ──────────────────────────────────────────────────────────
COPY . /var/www/html/

# Remove entrypoint script from web root — it's not a web file
RUN rm -f /var/www/html/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["apache2-foreground"]
