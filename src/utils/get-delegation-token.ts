import { getSecretHash } from "./get-secret-hash";

const cognitoUrl = "https://cognito-idp.eu-north-1.amazonaws.com/";

export async function getDelegationToken(
  clientId: string,
  clientSecret: string,
  username: string,
  accessToken: string,
  scope: string
) {
  const secretHash = getSecretHash(clientId, clientSecret, username);

  const initiateAuthResponse = await fetch(`${cognitoUrl}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "CUSTOM_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        SECRET_HASH: secretHash,
      },
    }),
  });
  const initiateAuthData = await initiateAuthResponse.json();

  const respondToAuthChallengeResponse = await fetch(`${cognitoUrl}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target":
        "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
    },
    body: JSON.stringify({
      ChallengeName: "CUSTOM_CHALLENGE",
      ClientId: clientId,
      Session: initiateAuthData.Session,
      ChallengeResponses: {
        USERNAME: username,
        ANSWER: accessToken,
        SECRET_HASH: secretHash,
      },
      ClientMetadata: {
        scope,
      },
    }),
  });
  const respondToAuthChallengeData =
    await respondToAuthChallengeResponse.json();

  return respondToAuthChallengeData.AuthenticationResult.AccessToken;
}
