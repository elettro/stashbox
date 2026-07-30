import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected exactly one match, found ${count}.`);
  }
  return source.replace(before, after);
}

const indexPath = 'social-factory-api/index.mjs';
const templatePath = 'social-factory-api/infrastructure/template.yaml';

let indexSource = fs.readFileSync(indexPath, 'utf8');
indexSource = replaceOnce(
  indexSource,
  `import { createSchedulePublishService } from './schedule-publish.mjs';`,
  `import { createSchedulePublishService } from './schedule-publish.mjs';\nimport { createRequestAuthenticator } from './request-auth.mjs';`,
  'request authenticator import'
);
indexSource = replaceOnce(
  indexSource,
  `  reviewPublisher = null,\n  reviewScheduler = null\n} = {}) {`,
  `  reviewPublisher = null,\n  reviewScheduler = null,\n  requestAuthenticator = process.env.SOCIAL_CUSTOM_GPT_SECRET ? createRequestAuthenticator() : null\n} = {}) {`,
  'handler dependency injection'
);
indexSource = replaceOnce(
  indexSource,
  `  return async function socialFactoryHandler(event = {}) {\n    const method = getRequestMethod(event);\n    const path = getRequestPath(event);`,
  `  return async function socialFactoryHandler(event = {}) {\n    const method = getRequestMethod(event);\n    const path = getRequestPath(event);`,
  'handler anchor'
);
indexSource = replaceOnce(
  indexSource,
  `    try {\n      if (method === 'GET' && path === '/social/health') {`,
  `    let authenticatedActor = null;\n\n    try {\n      if (requestAuthenticator) {\n        const normalized = await requestAuthenticator.normalize(event, { method, path });\n        event = normalized.event;\n        authenticatedActor = normalized.actor;\n        if (authenticatedActor) {\n          console.info('Social Factory authenticated action', {\n            actor_id: authenticatedActor.id,\n            actor_type: authenticatedActor.type,\n            permission: authenticatedActor.permission,\n            method,\n            path\n          });\n        }\n      }\n\n      if (method === 'GET' && path === '/social/health') {`,
  'request normalization and audit logging'
);
indexSource = replaceOnce(
  indexSource,
  `            securePreviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),\n            executionRoleScope:`,
  `            securePreviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),\n            customGptAuthenticationConfigured: Boolean(process.env.SOCIAL_CUSTOM_GPT_SECRET),\n            executionRoleScope:`,
  'health capability flag'
);
indexSource = replaceOnce(
  indexSource,
  `    } catch (error) {\n      return errorResponse(error);`,
  `    } catch (error) {\n      if (authenticatedActor) {\n        console.warn('Social Factory authenticated action failed', {\n          actor_id: authenticatedActor.id,\n          actor_type: authenticatedActor.type,\n          permission: authenticatedActor.permission,\n          method,\n          path,\n          error: error?.message || 'internal_error'\n        });\n      }\n      return errorResponse(error);`,
  'authenticated failure audit logging'
);
fs.writeFileSync(indexPath, indexSource);

let templateSource = fs.readFileSync(templatePath, 'utf8');
const tokenSecretBlock = `  YoutubeOAuthTokenSecret:\n    Type: AWS::SecretsManager::Secret\n    Properties:\n      Name: stashbox/social-factory/dev/youtube-oauth/tokens\n      Description: YouTube OAuth refresh token and channel metadata for Stashbox Social Factory DEV.\n      SecretString: '{}'\n      Tags:\n        - Key: Application\n          Value: stashbox-social-factory\n        - Key: Environment\n          Value: dev\n        - Key: Purpose\n          Value: youtube-oauth-tokens\n`;
const customGptSecretBlock = `${tokenSecretBlock}\n  CustomGptCredentialSecret:\n    Type: AWS::SecretsManager::Secret\n    DeletionPolicy: Retain\n    UpdateReplacePolicy: Retain\n    Properties:\n      Name: stashbox/social-factory/dev/custom-gpt\n      Description: Dedicated revocable credential for the private Stashbox Radio Custom GPT in DEV.\n      GenerateSecretString:\n        SecretStringTemplate: >-\n          {"actor_id":"stashbox-radio-gpt","enabled":true,"permissions":["songs:read","campaigns:plan","campaigns:create_drafts","renders:read","renders:create_drafts","renders:launch","review:read","review:write","review:decide","review:stage","schedule:create","schedule:cancel","youtube:read","youtube:publish"]}\n        GenerateStringKey: api_key\n        PasswordLength: 64\n        ExcludePunctuation: true\n      Tags:\n        - Key: Application\n          Value: stashbox-social-factory\n        - Key: Environment\n          Value: dev\n        - Key: Purpose\n          Value: custom-gpt-credential\n`;
templateSource = replaceOnce(templateSource, tokenSecretBlock, customGptSecretBlock, 'custom GPT secret resource');
templateSource = replaceOnce(
  templateSource,
  `        - PolicyName: SocialApiDevYoutubeOAuthSecrets\n          PolicyDocument:\n            Version: '2012-10-17'\n            Statement:\n              - Sid: ReadYoutubeOAuthSecrets\n                Effect: Allow\n                Action:\n                  - secretsmanager:DescribeSecret\n                  - secretsmanager:GetSecretValue\n                Resource:\n                  - !Ref YoutubeOAuthConfigSecret\n                  - !Ref YoutubeOAuthTokenSecret\n              - Sid: WriteYoutubeOAuthTokenSecret`,
  `        - PolicyName: SocialApiDevYoutubeOAuthSecrets\n          PolicyDocument:\n            Version: '2012-10-17'\n            Statement:\n              - Sid: ReadYoutubeOAuthSecrets\n                Effect: Allow\n                Action:\n                  - secretsmanager:DescribeSecret\n                  - secretsmanager:GetSecretValue\n                Resource:\n                  - !Ref YoutubeOAuthConfigSecret\n                  - !Ref YoutubeOAuthTokenSecret\n                  - !Ref CustomGptCredentialSecret\n              - Sid: WriteYoutubeOAuthTokenSecret`,
  'API role custom GPT secret read permission'
);
templateSource = replaceOnce(
  templateSource,
  `  SocialApiDevFunction:\n    Type: AWS::Serverless::Function\n    Properties:\n      FunctionName: stashbox-social-api-dev\n      Description: Isolated Stashbox Social Factory DEV API.\n      CodeUri: ../\n      Handler: index.handler\n      Runtime: nodejs22.x\n      Architectures:\n        - x86_64\n      MemorySize: 1024\n      Timeout: 900\n      Role: !GetAtt SocialApiDevRole.Arn\n      Environment:\n        Variables:\n          APP_ENV: !Ref EnvironmentName\n          ALLOWED_ORIGIN: !Ref AllowedOrigin\n          YOUTUBE_OAUTH_CONFIG_SECRET: !Ref YoutubeOAuthConfigSecret\n          YOUTUBE_OAUTH_TOKEN_SECRET: !Ref YoutubeOAuthTokenSecret`,
  `  SocialApiDevFunction:\n    Type: AWS::Serverless::Function\n    Properties:\n      FunctionName: stashbox-social-api-dev\n      Description: Isolated Stashbox Social Factory DEV API.\n      CodeUri: ../\n      Handler: index.handler\n      Runtime: nodejs22.x\n      Architectures:\n        - x86_64\n      MemorySize: 1024\n      Timeout: 900\n      Role: !GetAtt SocialApiDevRole.Arn\n      Environment:\n        Variables:\n          APP_ENV: !Ref EnvironmentName\n          ALLOWED_ORIGIN: !Ref AllowedOrigin\n          YOUTUBE_OAUTH_CONFIG_SECRET: !Ref YoutubeOAuthConfigSecret\n          YOUTUBE_OAUTH_TOKEN_SECRET: !Ref YoutubeOAuthTokenSecret\n          SOCIAL_CUSTOM_GPT_SECRET: !Ref CustomGptCredentialSecret`,
  'API custom GPT secret environment variable'
);
templateSource = replaceOnce(
  templateSource,
  `  YoutubeOAuthTokenSecretArn:\n    Value: !Ref YoutubeOAuthTokenSecret\n  SocialPublishBucketName:`,
  `  YoutubeOAuthTokenSecretArn:\n    Value: !Ref YoutubeOAuthTokenSecret\n  CustomGptCredentialSecretArn:\n    Value: !Ref CustomGptCredentialSecret\n  SocialPublishBucketName:`,
  'custom GPT secret output'
);
fs.writeFileSync(templatePath, templateSource);

console.log('Applied dedicated Custom GPT authentication to the Social Factory API and DEV stack.');
