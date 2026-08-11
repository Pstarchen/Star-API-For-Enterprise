ARG ALPINE_IMAGE=m.daocloud.io/docker.io/library/alpine:3.20
FROM ${ALPINE_IMAGE}

RUN apk add --no-cache php83 php83-cgi

WORKDIR /runner
COPY server.php /runner/server.php
COPY --chmod=755 entrypoint.sh /usr/local/bin/star-api-php-entrypoint

USER nobody
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/star-api-php-entrypoint"]
CMD ["php83", "-d", "variables_order=EGPCS", "-S", "0.0.0.0:8080", "/runner/server.php"]
