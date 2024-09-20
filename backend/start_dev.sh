#! /bin/sh

args=$(printf "%s " \
  "--spring.datasource.url=jdbc:postgresql://localhost:5432/loculus" \
  "--spring.datasource.username=postgres" \
  "--spring.datasource.password=unsecure" \
  "--loculus.config.path=../website/tests/config/backend_config.json" \
  "--loculus.debug-mode=true" \
  "--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8083/realms/loculus/protocol/openid-connect/certs" \
  "--keycloak.user=backend" \
  "--keycloak.password=backend" \
  "--keycloak.realm=loculus" \
  "--keycloak.client=backend-client" \
  "--keycloak.url=http://localhost:8083"
)

./gradlew bootRun --args="$args"
