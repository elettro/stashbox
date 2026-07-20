# Stashbox Radio DEV User Accounts Deployment Status

- Deployment target: `stashbox-radio-api-dev-v2`
- AWS region: `us-east-1`
- API stage: `/dev`
- Database schema target: `radio_dev`
- Cognito user pool configured: Yes
- Cognito app client configured: Yes
- Password minimum: 8 characters
- Lambda deployment: PASS
- Account foundation tests: PASS
- Notification tests: PASS
- Video Factory regression tests: PASS
- TRUE DEV smoke test: PASS
- Public auth configuration route: PASS
- Protected `/radio/me` without a token returns 401: PASS
- Production touched: No

## Remaining

- Apply `20260720_user_accounts_sprint_1a_dev.sql` to `radio_dev`
- Apply DEV API Gateway throttling
- Deploy DEV player account frontend
- Complete real signup, verification, login, refresh, password reset, logout, favorites, playlists, history, preferences, and notification-state testing
