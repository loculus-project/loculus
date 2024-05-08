FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY build/libs/backend.jar app.jar

# Expose the port your application uses
EXPOSE 8079

# Command to run your jar
ENTRYPOINT ["java", "-jar", "app.jar", "--spring.profiles.active=docker"]
