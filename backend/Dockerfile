# Keep the Java version in sync with the other Java versions (backend/build.gradle, CI workflows)
FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

COPY build/libs/backend.jar app.jar
COPY entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8079

ENTRYPOINT ["./entrypoint.sh"]
