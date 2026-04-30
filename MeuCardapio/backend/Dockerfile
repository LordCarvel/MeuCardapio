FROM eclipse-temurin:17-jdk-jammy AS build

WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw -DskipTests package

FROM eclipse-temurin:17-jre-jammy

WORKDIR /app
ENV PORT=10000
EXPOSE 10000

COPY --from=build /app/target/backend-0.0.1-SNAPSHOT.jar /app/app.jar

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
