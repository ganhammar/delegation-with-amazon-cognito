import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

interface UserAttributes {
  [key: string]: string;
}

interface GroupConfiguration {
  groupsToOverride: string[];
  iamRolesToOverride: string[];
  preferredRole: string;
}

interface ClientMetadata {
  [key: string]: string;
}

interface ClaimsAndScopeOverrideDetails {
  claimsToAddOrOverride?: { [key: string]: string };
  claimsToSuppress?: string[];
  scopesToAdd?: string[];
  scopesToSuppress?: string[];
}

interface GroupOverrideDetails {
  groupsToOverride: string[];
  iamRolesToOverride: string[];
  preferredRole: string;
}

interface PreTokenGenerationTriggerEventRequest {
  userAttributes: UserAttributes;
  scopes: string[];
  groupConfiguration: GroupConfiguration;
  clientMetadata: ClientMetadata;
}

interface PreTokenGenerationTriggerEventResponse {
  claimsAndScopeOverrideDetails: {
    idTokenGeneration?: ClaimsAndScopeOverrideDetails;
    accessTokenGeneration?: ClaimsAndScopeOverrideDetails;
    groupOverrideDetails?: GroupOverrideDetails;
  };
}

interface CallerContext {
  awsSdkVersion: string;
  clientId: string;
}

interface PreTokenGenerationTriggerHandler {
  callerContext: CallerContext;
  request: PreTokenGenerationTriggerEventRequest;
  response: PreTokenGenerationTriggerEventResponse;
}

export const handler = async (event: PreTokenGenerationTriggerHandler) => {
  const scopesToAdd = [];
  if (event.request?.clientMetadata?.scope) {
    const scopes = event.request.clientMetadata.scope.split(" ");
    const cognitoClient = new CognitoIdentityProviderClient({
      region: "eu-north-1",
    });

    const region = process.env.AWS_REGION!;
    const ssmClient = new SSMClient({ region });
    const ssmCommand = new GetParameterCommand({
      Name: "/delegation/userpool/id",
    });
    const userPoolId = (await ssmClient.send(ssmCommand)).Parameter!.Value!;

    const command = new DescribeUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: event.callerContext.clientId,
    });

    const data = await cognitoClient.send(command);

    const clientScopes = data.UserPoolClient?.AllowedOAuthScopes || [];

    for (const scope of scopes) {
      if (clientScopes.includes(scope)) {
        scopesToAdd.push(event.request.clientMetadata.scope);
      }
    }
  }

  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: {
        scopesToAdd,
      },
      accessTokenGeneration: {
        scopesToAdd,
      },
    },
  };

  return event;
};
