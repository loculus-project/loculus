FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

COPY build/libs/backend.jar app.jar
COPY entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8079

ENTRYPOINT ["./entrypoint.sh"]
