ARG ALPINE_IMAGE=m.daocloud.io/docker.io/library/alpine:3.20
FROM ${ALPINE_IMAGE}

# PHP packages uploaded by administrators are allowed to call common PHP
# extensions used by small API scripts. curl and openssl cover upstream HTTP
# calls; mbstring/iconv/json/fileinfo improve compatibility with older samples.
RUN apk add --no-cache php83 php83-cgi php83-curl php83-fileinfo php83-iconv php83-mbstring php83-openssl

WORKDIR /runner
COPY server.php /runner/server.php
COPY --chmod=755 entrypoint.sh /usr/local/bin/star-api-php-entrypoint

USER nobody
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/star-api-php-entrypoint"]
CMD ["php83", "-d", "variables_order=EGPCS", "-S", "0.0.0.0:8080", "/runner/server.php"]
