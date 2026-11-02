FROM localstack/localstack:4
COPY --chmod=755 localstack-init.sh /etc/localstack/init/ready.d/init-sqs.sh
