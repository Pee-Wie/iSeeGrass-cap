FROM php:8.2-apache

# Install the exact MySQL database drivers your code needs
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copy your local PHP application code into the Apache directory
COPY . /var/www/html/

# Expose the standard web traffic port
EXPOSE 80
