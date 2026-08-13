ARG ALPINE_IMAGE=m.daocloud.io/docker.io/library/alpine:3.20
FROM ${ALPINE_IMAGE}

# PHP packages uploaded by administrators are allowed to call common PHP
# extensions. curl is required for proxy-style APIs that call an upstream
# service from the PHP entry point.
RUN apk add --no-cache php83 php83-cgi php83-curl

WORKDIR /runner
COPY server.php /runner/server.php
COPY --chmod=755 entrypoint.sh /usr/local/bin/star-api-php-entrypoint

USER nobody
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/star-api-php-entrypoint"]
CMD ["php83", "-d", "variables_order=EGPCS", "-S", "0.0.0.0:8080", "/runner/server.php"]
