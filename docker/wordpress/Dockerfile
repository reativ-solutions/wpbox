# WordPress image tag (WordPress + PHP version). Set WORDPRESS_TAG in .env,
# e.g. "php8.2-apache" or "6.8-php8.1-apache". See https://hub.docker.com/_/wordpress
ARG WORDPRESS_TAG=php8.3-apache

FROM wordpress:cli-2.12.0-php8.3 AS wpcli

FROM wordpress:${WORDPRESS_TAG}

# WP-CLI inside the container (wpdev wp ...)
COPY --from=wpcli /usr/local/bin/wp /usr/local/bin/wp

# unzip to extract the wp-content backup
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip less \
 && rm -rf /var/lib/apt/lists/*

# Bigger uploads and memory for local development
RUN { echo 'upload_max_filesize=128M'; echo 'post_max_size=128M'; echo 'memory_limit=512M'; echo 'max_execution_time=300'; } \
    > /usr/local/etc/php/conf.d/wpdev.ini

# Answer on any port, so Apache can also listen on the public port (see local-entrypoint.sh).
RUN sed -i 's/<VirtualHost \*:80>/<VirtualHost *:*>/' /etc/apache2/sites-available/000-default.conf

COPY local-entrypoint.sh /usr/local/bin/local-entrypoint.sh
ENTRYPOINT ["bash", "/usr/local/bin/local-entrypoint.sh"]
CMD ["apache2-foreground"]
