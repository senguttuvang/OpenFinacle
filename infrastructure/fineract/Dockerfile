FROM eclipse-temurin:21-jre-jammy AS distribution
WORKDIR /distribution
RUN curl -fSL --retry 3 https://dlcdn.apache.org/fineract/1.15.0/apache-fineract-bin-1.15.0.tar.gz -o fineract.tar.gz \
    && echo '0db5983c228ed6c96dc2e9d8918f570172758acceb898525d39c44684e9125215d59c1b64f8c85ba18141ea3d9c0c4955f3a670681464784f2af06d34b74ce1c  fineract.tar.gz' | sha512sum -c - \
    && tar -xzf fineract.tar.gz --strip-components=1 \
    && cp $(find . -name 'fineract-provider-1.15.0.jar' -print -quit) /fineract.jar
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=distribution /fineract.jar /app/fineract.jar
RUN mkdir -p /var/log/fineract /var/logs/fineract && chmod -R 777 /var/log/fineract /var/logs/fineract
USER 1000
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/fineract.jar"]
