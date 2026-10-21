FROM php:8.2-apache

# Install MySQL drivers
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Fix "More than one MPM loaded" crash:
# php:8.2-apache can have both mpm_event and mpm_prefork enabled.
# PHP requires mpm_prefork (it is not thread-safe). Disable the others explicitly.
RUN a2dismod mpm_event mpm_worker 2>/dev/null || true \
 && a2enmod mpm_prefork

# Enable mod_rewrite for .htaccess URL rewriting
RUN a2enmod rewrite

# Allow .htaccess overrides in the web root
RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Copy application code into Apache web root
COPY . /var/www/html/

EXPOSE 80
