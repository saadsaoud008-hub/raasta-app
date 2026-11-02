#!/bin/sh
set -eu
awslocal sqs create-queue --queue-name ride-events-dlq --attributes MessageRetentionPeriod=1209600
dlq_arn=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/ride-events-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
awslocal sqs create-queue --queue-name ride-events --attributes "{\"VisibilityTimeout\":\"120\",\"ReceiveMessageWaitTimeSeconds\":\"20\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$dlq_arn\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}"
