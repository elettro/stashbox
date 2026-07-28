from pathlib import Path


def replace_idempotent(path: str, old_lines: list[str], new_lines: list[str]) -> None:
    file = Path(path)
    text = file.read_text()
    old = "\n".join(old_lines)
    new = "\n".join(new_lines)
    if new in text:
        print(f"already fixed: {path}")
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one old match, found {count}")
    file.write_text(text.replace(old, new, 1))
    print(f"fixed: {path}")


def main() -> None:
    deploy = ".github/workflows/deploy-social-factory-api-dev.yml"
    bootstrap = ".github/workflows/bootstrap-social-factory-cloudformation-role.yml"

    replace_idempotent(
        deploy,
        [
            "      EXPECTED_SCHEDULE_QUEUE_NAME: stashbox-social-publish-dev",
            "      EXPECTED_SCHEDULE_DLQ_NAME: stashbox-social-publish-dev-dlq",
        ],
        [
            "      EXPECTED_SCHEDULE_QUEUE_NAME: stashbox-social-publish-dev.fifo",
            "      EXPECTED_SCHEDULE_DLQ_NAME: stashbox-social-publish-dev-dlq.fifo",
        ],
    )
    replace_idempotent(
        deploy,
        ["            --attribute-names QueueArn VisibilityTimeout RedrivePolicy SqsManagedSseEnabled)"],
        ["            --attribute-names QueueArn VisibilityTimeout RedrivePolicy SqsManagedSseEnabled FifoQueue ContentBasedDeduplication)"],
    )
    replace_idempotent(
        deploy,
        [
            '              .Attributes.SqsManagedSseEnabled == "true" and',
            '              ((.Attributes.RedrivePolicy | fromjson).deadLetterTargetArn == $dlq) and',
        ],
        [
            '              .Attributes.SqsManagedSseEnabled == "true" and',
            '              .Attributes.FifoQueue == "true" and',
            '              .Attributes.ContentBasedDeduplication == "true" and',
            '              ((.Attributes.RedrivePolicy | fromjson).deadLetterTargetArn == $dlq) and',
        ],
    )
    replace_idempotent(
        bootstrap,
        ['                "Resource": "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/stashbox-social-*:*"'],
        [
            '                "Resource": [',
            '                  "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/stashbox-social-*",',
            '                  "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/stashbox-social-*:*"',
            '                ]',
        ],
    )


if __name__ == "__main__":
    main()
