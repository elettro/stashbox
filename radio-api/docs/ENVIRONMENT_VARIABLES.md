# Radio API Environment Variables

## Runtime identity

The Lambda determines runtime identity from environment variables only, in this order:

1. `APP_ENV`
2. `STAGE`
3. `NODE_ENV`
4. `ENVIRONMENT`
5. fallback: `prod`

Values are normalized to lowercase. Route paths such as `/dev/` are not used to decide runtime behavior.

## Ad settings

`AD_SETTINGS_ID` is the preferred explicit row id for `radio.ad_settings`. If it is not set, the runtime environment value above is used.

## Uploads

Upload presigning requires an upload bucket and AWS credentials. The bucket can be provided with `UPLOAD_BUCKET`, `S3_BUCKET`, or `RADIO_UPLOAD_BUCKET`.

Upload region resolution supports these aliases in order:

1. `UPLOAD_REGION`
2. `UPLOAD_BUCKET_REGION`
3. `S3_BUCKET_REGION`
4. `RADIO_UPLOAD_BUCKET_REGION`
5. `AWS_REGION`
6. `AWS_DEFAULT_REGION`
7. fallback: `us-east-1`

