# Video Factory Endpoint Diagnostic

Captured: 2026-07-19T15:00:10Z

- API status: 200
- API body:
```json
{"success":true,"configured":true,"region":"us-east-1","cluster_arn":"arn:aws:ecs:us-east-1:656260749296:cluster/stashbox-video-factory-dev","cluster_status":"ACTIVE","registered_container_instances":0,"running_tasks":0,"pending_tasks":0,"task_definition_arn":"arn:aws:ecs:us-east-1:656260749296:task-definition/stashbox-video-factory-renderer-dev:4","task_cpu":"2048","task_memory":"4096","output_bucket":"stashbox-radio-video-factory-dev-656260749296-us-east-1","container_name":"video-factory-renderer","concurrency":1}
```

- Lambda VPC configuration:
```json
{
  "Timeout": 15,
  "VpcConfig": {
    "SubnetIds": [
      "subnet-0d72163f2329cb9de",
      "subnet-065ac13129062f85d",
      "subnet-0e2b4207279f79c3f",
      "subnet-08e50d69ee12acab4",
      "subnet-02af641e04dd09091",
      "subnet-077df0efdee7fa00c"
    ],
    "SecurityGroupIds": [
      "sg-069f30e65e65b6b07"
    ],
    "VpcId": "vpc-0f336fe5f1d929d36",
    "Ipv6AllowedForDualStack": false
  },
  "Environment": {
    "Variables": {
      "VIDEO_FACTORY_ECS_CLUSTER": "arn:aws:ecs:us-east-1:656260749296:cluster/stashbox-video-factory-dev",
      "VIDEO_FACTORY_ECS_TASK_DEFINITION": "arn:aws:ecs:us-east-1:656260749296:task-definition/stashbox-video-factory-renderer-dev:4",
      "VIDEO_FACTORY_RENDER_BUCKET": "stashbox-radio-video-factory-dev-656260749296-us-east-1"
    }
  }
}
```

- VPC endpoints:
```json
[
  {
    "Id": "vpce-0963075fb34890de2",
    "Service": "com.amazonaws.us-east-1.s3",
    "Type": "Gateway",
    "State": "available",
    "PrivateDns": false,
    "Subnets": [],
    "RouteTables": [
      "rtb-01cbac51dfa0b5be7"
    ],
    "Groups": [],
    "Dns": []
  },
  {
    "Id": "vpce-02381babc0b193e0d",
    "Service": "com.amazonaws.us-east-1.ecs",
    "Type": "Interface",
    "State": "available",
    "PrivateDns": true,
    "Subnets": [
      "subnet-065ac13129062f85d",
      "subnet-0e2b4207279f79c3f"
    ],
    "RouteTables": [],
    "Groups": [
      "sg-03a5ac807d9a82bd0"
    ],
    "Dns": [
      "vpce-02381babc0b193e0d-gcz8bk4k.ecs.us-east-1.vpce.amazonaws.com",
      "vpce-02381babc0b193e0d-gcz8bk4k-us-east-1b.ecs.us-east-1.vpce.amazonaws.com",
      "vpce-02381babc0b193e0d-gcz8bk4k-us-east-1a.ecs.us-east-1.vpce.amazonaws.com",
      "ecs.us-east-1.amazonaws.com",
      "ecs.us-east-1.api.aws"
    ]
  }
]
```

- Lambda security group:
```json
{
  "GroupId": "sg-069f30e65e65b6b07",
  "Egress": [
    {
      "IpProtocol": "-1",
      "UserIdGroupPairs": [],
      "IpRanges": [
        {
          "CidrIp": "0.0.0.0/0"
        }
      ],
      "Ipv6Ranges": [],
      "PrefixListIds": []
    }
  ]
}
```

- Endpoint security groups:
```json
{
  "SecurityGroups": [
    {
      "GroupId": "sg-03a5ac807d9a82bd0",
      "IpPermissionsEgress": [
        {
          "IpProtocol": "-1",
          "UserIdGroupPairs": [],
          "IpRanges": [
            {
              "CidrIp": "0.0.0.0/0"
            }
          ],
          "Ipv6Ranges": [],
          "PrefixListIds": []
        }
      ],
      "Tags": [
        {
          "Key": "aws:cloudformation:logical-id",
          "Value": "ApiLambdaEndpointSecurityGroup"
        },
        {
          "Key": "aws:cloudformation:stack-id",
          "Value": "arn:aws:cloudformation:us-east-1:656260749296:stack/stashbox-video-factory-dev/6a401770-837a-11f1-9068-12175102f045"
        },
        {
          "Key": "Name",
          "Value": "stashbox-video-factory-lambda-endpoints-dev"
        },
        {
          "Key": "aws:cloudformation:stack-name",
          "Value": "stashbox-video-factory-dev"
        }
      ],
      "VpcId": "vpc-0f336fe5f1d929d36",
      "SecurityGroupArn": "arn:aws:ec2:us-east-1:656260749296:security-group/sg-03a5ac807d9a82bd0",
      "OwnerId": "656260749296",
      "GroupName": "stashbox-video-factory-dev-ApiLambdaEndpointSecurityGroup-DVi2eeOfY5AZ",
      "Description": "HTTPS access from the TRUE DEV API Lambda to private AWS service endpoints.",
      "IpPermissions": [
        {
          "IpProtocol": "tcp",
          "FromPort": 443,
          "ToPort": 443,
          "UserIdGroupPairs": [
            {
              "UserId": "656260749296",
              "GroupId": "sg-069f30e65e65b6b07"
            }
          ],
          "IpRanges": [],
          "Ipv6Ranges": [],
          "PrefixListIds": []
        }
      ]
    }
  ]
}
{
    "SecurityGroups": [
        {
            "GroupId": "sg-03a5ac807d9a82bd0",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "Tags": [
                {
                    "Key": "aws:cloudformation:logical-id",
                    "Value": "ApiLambdaEndpointSecurityGroup"
                },
                {
                    "Key": "aws:cloudformation:stack-id",
                    "Value": "arn:aws:cloudformation:us-east-1:656260749296:stack/stashbox-video-factory-dev/6a401770-837a-11f1-9068-12175102f045"
                },
                {
                    "Key": "Name",
                    "Value": "stashbox-video-factory-lambda-endpoints-dev"
                },
                {
                    "Key": "aws:cloudformation:stack-name",
                    "Value": "stashbox-video-factory-dev"
                }
            ],
            "VpcId": "vpc-0f336fe5f1d929d36",
            "SecurityGroupArn": "arn:aws:ec2:us-east-1:656260749296:security-group/sg-03a5ac807d9a82bd0",
            "OwnerId": "656260749296",
            "GroupName": "stashbox-video-factory-dev-ApiLambdaEndpointSecurityGroup-DVi2eeOfY5AZ",
            "Description": "HTTPS access from the TRUE DEV API Lambda to private AWS service endpoints.",
            "IpPermissions": [
                {
                    "IpProtocol": "tcp",
                    "FromPort": 443,
                    "ToPort": 443,
                    "UserIdGroupPairs": [
                        {
                            "UserId": "656260749296",
                            "GroupId": "sg-069f30e65e65b6b07"
                        }
                    ],
                    "IpRanges": [],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ]
        }
    ]
}
```

- Route tables:
```json
[
  {
    "Id": "rtb-01cbac51dfa0b5be7",
    "Routes": [
      {
        "DestinationCidrBlock": "172.31.0.0/16",
        "GatewayId": "local",
        "Origin": "CreateRouteTable",
        "State": "active"
      },
      {
        "DestinationCidrBlock": "0.0.0.0/0",
        "GatewayId": "igw-0a266d92d80f0c3c5",
        "Origin": "CreateRoute",
        "State": "active"
      },
      {
        "DestinationPrefixListId": "pl-63a5400a",
        "GatewayId": "vpce-0963075fb34890de2",
        "Origin": "CreateRoute",
        "State": "active"
      }
    ]
  }
]
```

- Lambda logs after request:
```text

aws: [ERROR]: An error occurred (AccessDeniedException) when calling the FilterLogEvents operation: User: arn:aws:iam::656260749296:user/stashbox-github-actions-dev is not authorized to perform: logs:FilterLogEvents on resource: arn:aws:logs:us-east-1:656260749296:log-group:/aws/lambda/stashbox-radio-api-dev-v2:log-stream: because no identity-based policy allows the logs:FilterLogEvents action
```
