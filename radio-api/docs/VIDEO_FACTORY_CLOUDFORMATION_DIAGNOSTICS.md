# Video Factory CloudFormation Diagnostics

Stack status: ROLLBACK_COMPLETE

Failed events:
```text
2026-07-19T13:52:50.696000+00:00	RenderCluster	AWS::ECS::Cluster	CREATE_FAILED	Resource creation cancelled
2026-07-19T13:52:50.650000+00:00	RenderVpc	AWS::EC2::VPC	CREATE_FAILED	Resource creation cancelled
2026-07-19T13:52:50.612000+00:00	RenderTaskExecutionRole	AWS::IAM::Role	CREATE_FAILED	Resource creation cancelled
2026-07-19T13:52:50.608000+00:00	RenderLogGroup	AWS::Logs::LogGroup	CREATE_FAILED	Resource creation cancelled
2026-07-19T13:52:50.607000+00:00	RenderInternetGateway	AWS::EC2::InternetGateway	CREATE_FAILED	Resource creation cancelled
2026-07-19T13:52:50.332000+00:00	RenderBucket	AWS::S3::Bucket	CREATE_FAILED	Resource handler returned message: "User: arn:aws:iam::656260749296:user/stashbox-github-actions-dev is not authorized to perform: s3:PutEncryptionConfiguration on resource: "arn:aws:s3:::stashbox-radio-video-factory-dev-656260749296-us-east-1" because no identity-based policy allows the s3:PutEncryptionConfiguration action (Service: S3, Status Code: 403, Request ID: 4HENH8D6S4968N7K, Extended Request ID: 4pZ144YtS+Lt2boSLp9AZNhvKhFJJ+0/IkPIMkCa58KkUJh+qVLs1hY/y5ooJ23WcbvUmGW1e4Y=) (SDK Attempt Count: 1)" (RequestToken: f5cc0728-bb0d-8d56-d79a-416fd9e506e9, HandlerErrorCode: GeneralServiceException)
```
