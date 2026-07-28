from pathlib import Path


def replace_idempotent(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        print(f"Already applied: {path}")
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one old match, found {count}: {old!r}")
    file.write_text(text.replace(old, new, 1))
    print(f"Updated: {path}")


def main() -> None:
    replace_idempotent(
        "social-factory-api/schedule-publish.mjs",
        "          RoleArn: targetRoleArn,\n          Input: JSON.stringify({",
        "          RoleArn: targetRoleArn,\n          SqsParameters: { MessageGroupId: 'scheduled-publish' },\n          Input: JSON.stringify({",
    )

    replace_idempotent(
        "social-factory-api/infrastructure/template.yaml",
        "      QueueName: stashbox-social-publish-dev-dlq\n      MessageRetentionPeriod: 1209600",
        "      QueueName: stashbox-social-publish-dev-dlq.fifo\n      FifoQueue: true\n      ContentBasedDeduplication: true\n      MessageRetentionPeriod: 1209600",
    )
    replace_idempotent(
        "social-factory-api/infrastructure/template.yaml",
        "      QueueName: stashbox-social-publish-dev\n      VisibilityTimeout: 960",
        "      QueueName: stashbox-social-publish-dev.fifo\n      FifoQueue: true\n      ContentBasedDeduplication: true\n      VisibilityTimeout: 960",
    )
    replace_idempotent(
        "social-factory-api/infrastructure/template.yaml",
        "      ReservedConcurrentExecutions: 1\n",
        "",
    )

    replace_idempotent(
        ".github/workflows/deploy-social-factory-api-dev.yml",
        "      EXPECTED_SCHEDULE_QUEUE_NAME: stashbox-social-publish-dev\n      EXPECTED_SCHEDULE_DLQ_NAME: stashbox-social-publish-dev-dlq",
        "      EXPECTED_SCHEDULE_QUEUE_NAME: stashbox-social-publish-dev.fifo\n      EXPECTED_SCHEDULE_DLQ_NAME: stashbox-social-publish-dev-dlq.fifo",
    )
    replace_idempotent(
        ".github/workflows/deploy-social-factory-api-dev.yml",
        "--attribute-names QueueArn VisibilityTimeout RedrivePolicy SqsManagedSseEnabled)",
        "--attribute-names QueueArn VisibilityTimeout RedrivePolicy SqsManagedSseEnabled FifoQueue ContentBasedDeduplication)",
    )
    replace_idempotent(
        ".github/workflows/deploy-social-factory-api-dev.yml",
        '.Attributes.SqsManagedSseEnabled == "true" and\n              ((.Attributes.RedrivePolicy | fromjson).deadLetterTargetArn == $dlq)',
        '.Attributes.SqsManagedSseEnabled == "true" and\n              .Attributes.FifoQueue == "true" and\n              .Attributes.ContentBasedDeduplication == "true" and\n              ((.Attributes.RedrivePolicy | fromjson).deadLetterTargetArn == $dlq)',
    )


if __name__ == "__main__":
    main()
